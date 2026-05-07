/* eslint-disable no-console */
/**
 * Generates a realistic-feeling tournament for development / demo use.
 *
 * Run with:  npm run seed
 *
 * Creates a new competition (does NOT touch existing competitions) in WEIGH_IN
 * status with ~300 weighed-in competitors distributed across Senior + Junior,
 * both genders, all 7 IJF weight classes. Bracket sizes vary per category to
 * exercise round-robin (3-4), clean elimination (~8), and single-repechage
 * with byes (12-16).
 *
 * After running, log into the dashboard, open the new competition, and click
 * "Generate Categories" then "Generate Brackets" to see the full flow.
 */

import { PrismaClient, Gender, AgeGroup, Belt, RegistrationStatus, CompetitionStatus } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env from the backend/ directory (script runs from here)
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const COMPETITION_NAME = `Open Mat Championship ${new Date().getFullYear()}`;
const COMPETITION_DATE = new Date('2026-06-15');
const COMPETITION_LOCATION = 'Olympic Training Center, Colorado Springs';

// ─── Weight classes (subset for the seed: Senior + Junior, both genders) ───

interface WeightTier {
  gender: Gender;
  ageGroup: AgeGroup;
  bands: { min: number; max: number; label: string }[];
}

function bands(limits: number[]) {
  return limits.map((limit, i) => {
    if (i === limits.length - 1) return { min: Math.abs(limit), max: 999, label: `+${Math.abs(limit)}` };
    const prev = i === 0 ? 0 : Math.abs(limits[i - 1]);
    return { min: prev, max: Math.abs(limit), label: `-${Math.abs(limit)}` };
  });
}

const WEIGHT_TIERS: WeightTier[] = [
  { gender: Gender.MALE,   ageGroup: AgeGroup.SENIOR, bands: bands([60, 66, 73, 81, 90, 100, 100]) },
  { gender: Gender.FEMALE, ageGroup: AgeGroup.SENIOR, bands: bands([48, 52, 57, 63, 70, 78, 78]) },
  { gender: Gender.MALE,   ageGroup: AgeGroup.JUNIOR, bands: bands([55, 60, 66, 73, 81, 90, 100, 100]) },
  { gender: Gender.FEMALE, ageGroup: AgeGroup.JUNIOR, bands: bands([44, 48, 52, 57, 63, 70, 78, 78]) },
];

// ─── Diverse name + club pools (judo is a global sport) ───

const FIRST_NAMES_M = [
  // Japanese
  'Hiroshi', 'Takeshi', 'Yuki', 'Daichi', 'Ren', 'Soma', 'Naohisa', 'Hifumi', 'Shohei',
  // French / European
  'Lucas', 'Mathieu', 'Quentin', 'Théo', 'Antoine', 'Romain', 'Julien', 'Bastien', 'Léo',
  // Russian / Georgian / Eastern European
  'Ivan', 'Dmitri', 'Sergey', 'Aleksandr', 'Vladimir', 'Lasha', 'Beka', 'Giorgi', 'Tato',
  // Brazilian / Latin American
  'Rafael', 'Gabriel', 'Lucas', 'Mateus', 'Pedro', 'Felipe', 'Diego', 'Andrés',
  // Korean
  'Min-jun', 'Jae-hyun', 'Seung-ho', 'Tae-yang', 'Jin-woo',
  // Mongolian
  'Naidan', 'Bat', 'Tsogbayar', 'Tuvshinjargal',
  // German / Dutch / Nordic
  'Sven', 'Magnus', 'Lukas', 'Niklas', 'Oskar',
  // North African / Middle Eastern
  'Karim', 'Adel', 'Walid', 'Yousef', 'Saeid', 'Ramin',
];

const FIRST_NAMES_F = [
  // Japanese
  'Sakura', 'Yui', 'Aiko', 'Riko', 'Mizuki', 'Akari', 'Rika', 'Funa', 'Tsukasa',
  // French / European
  'Clarisse', 'Margaux', 'Émilie', 'Camille', 'Manon', 'Léa', 'Chloé', 'Sarah',
  // Russian / Georgian / Eastern European
  'Yulia', 'Anastasia', 'Mariya', 'Valeriya', 'Nino', 'Ketevan',
  // Brazilian / Latin American
  'Ana', 'Beatriz', 'Mariana', 'Larissa', 'Rafaela', 'Sofía', 'Camila',
  // Korean
  'Ji-yoo', 'Min-seo', 'Soo-bin', 'Eun-bi', 'Hye-rim',
  // Mongolian
  'Sumya', 'Munkhsoyol', 'Tsetsegmaa',
  // German / Dutch / Nordic
  'Anna', 'Lena', 'Hanna', 'Mette',
  // North African / Middle Eastern
  'Amal', 'Sara', 'Layla', 'Fatma',
];

const LAST_NAMES = [
  // Japanese
  'Tanaka', 'Suzuki', 'Watanabe', 'Yamamoto', 'Kobayashi', 'Nakamura', 'Inoue', 'Maruyama', 'Abe',
  // French / European
  'Riner', 'Dupont', 'Martin', 'Bernard', 'Petit', 'Moreau', 'Lefevre', 'Garcia', 'Dubois',
  // Russian / Georgian / Eastern European
  'Petrov', 'Ivanov', 'Sokolov', 'Volkov', 'Shavdatuashvili', 'Zantaraia', 'Liparteliani', 'Bekauri',
  // Brazilian / Portuguese
  'Silva', 'Santos', 'Costa', 'Pereira', 'Mendes', 'Lima', 'Almeida', 'Oliveira',
  // Korean
  'Kim', 'Lee', 'Park', 'Choi', 'Jung', 'Han',
  // Mongolian
  'Tsogtbaatar', 'Boldbaatar', 'Munkhbat', 'Khorloodoi',
  // German / Dutch / Nordic
  'Schmidt', 'Müller', 'Andersen', 'Bjornsen', 'van der Berg', 'Hansen',
  // North African / Middle Eastern / Iranian
  'Khoshroo', 'Mollaei', 'El Mansouri', 'Bouyacoub', 'Hatami',
  // Spanish / Italian
  'Romero', 'Russo', 'Fernandez', 'Esposito', 'Conti',
];

const CLUBS = [
  'Kodokan Tokyo',
  'Paris Judo Club',
  'INEF Madrid',
  'CR Vasco da Gama',
  'Dynamo Moscow',
  'Tbilisi Judo Center',
  'Ulaanbaatar Wrestling Palace',
  'KSK Yongin',
  'Munich Polizei JC',
  'Amsterdam Judo Bond',
  'Tokai University',
  'Nippon Sport Science',
  'Tenri University',
  'Kano Cultural Society',
  'Seoul National University',
  'Belo Horizonte Dojo',
  'Rio de Janeiro Judo Federation',
  'CSKA Moscow',
  'Spartak Krasnodar',
  'Levski Sofia',
  'Györ AC',
  'Tashkent Olympic Center',
  'JKS Esfahan',
  'IRIB Tehran',
  'Almaty Judo Academy',
  'Ho Chi Minh JC',
  'Manila Judo Federation',
  'NYAC',
  'San Jose State Judo',
  'Pedro\'s Judo Center',
  'Etobicoke Olympium',
  'Mexico City Judo Hall',
  'Havana Sports Complex',
  'Buenos Aires Olímpico',
  'Sydney Judo Academy',
  'Auckland JC',
  'Casablanca Royal Club',
  'Cairo Sporting Club',
  'JC Algiers',
  'Tel Aviv Wingate',
  'Athens Olympic Sports',
  'Chișinău Olympic',
];

// ─── Helpers ───

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

function randomDateInRange(start: Date, end: Date): Date {
  const t = start.getTime() + Math.random() * (end.getTime() - start.getTime());
  return new Date(t);
}

function dobForAgeGroup(ageGroup: AgeGroup, refDate: Date): Date {
  // Senior: 21-35, Junior: 18-20 (per backend/src/categories/age-group.util.ts)
  let minAge: number, maxAge: number;
  if (ageGroup === AgeGroup.JUNIOR) { minAge = 18; maxAge = 20; }
  else { minAge = 21; maxAge = 30; }  // skew Senior toward 21-30 for realism
  const earliest = new Date(refDate); earliest.setFullYear(refDate.getFullYear() - maxAge - 1); earliest.setDate(refDate.getDate() + 1);
  const latest = new Date(refDate); latest.setFullYear(refDate.getFullYear() - minAge);
  return randomDateInRange(earliest, latest);
}

function pickBelt(ageGroup: AgeGroup): Belt {
  // Junior: brown/black-1dan dominant. Senior: black-1dan to black-3dan.
  if (ageGroup === AgeGroup.JUNIOR) {
    const r = Math.random();
    if (r < 0.15) return Belt.BLUE;
    if (r < 0.45) return Belt.BROWN;
    if (r < 0.95) return Belt.BLACK_1DAN;
    return Belt.BLACK_2DAN;
  }
  // SENIOR
  const r = Math.random();
  if (r < 0.1) return Belt.BROWN;
  if (r < 0.5) return Belt.BLACK_1DAN;
  if (r < 0.8) return Belt.BLACK_2DAN;
  if (r < 0.95) return Belt.BLACK_3DAN;
  return Belt.BLACK_4DAN;
}

function competitorsPerCategory(): number {
  // Mix: 10% small (round-robin), 20% medium (~8), 70% larger (12-16)
  const r = Math.random();
  if (r < 0.10) return 3 + Math.floor(Math.random() * 2);  // 3-4
  if (r < 0.30) return 7 + Math.floor(Math.random() * 2);  // 7-8
  return 12 + Math.floor(Math.random() * 5);                // 12-16
}

function weightInBand(min: number, max: number): number {
  // Real judoka cut to just below their class cap. For closed classes, draw from
  // a 6 kg band below the cap (always above the floor). For open classes (max=999),
  // sample 0.5..28 kg above the floor.
  if (max === 999) {
    const w = min + 0.5 + Math.random() * 28;
    return Math.round(w * 10) / 10;
  }
  const realisticMin = Math.max(min + 0.5, max - 6);
  const w = realisticMin + Math.random() * (max - realisticMin);
  return Math.round(w * 10) / 10;
}

// ─── Main ───

async function main() {
  // Reuse the test organizer if it exists; otherwise create it.
  let organizer = await prisma.user.findUnique({ where: { email: 'test@matside.com' } });
  if (!organizer) {
    const passwordHash = await bcrypt.hash('test1234', 10);
    organizer = await prisma.user.create({
      data: { email: 'test@matside.com', passwordHash, name: 'Test Organizer', role: 'ORGANIZER' },
    });
    console.log('Created organizer test@matside.com (password: test1234)');
  }

  const competition = await prisma.competition.create({
    data: {
      name: `${COMPETITION_NAME} (seed ${new Date().toISOString().slice(0, 16).replace('T', ' ')})`,
      date: COMPETITION_DATE,
      location: COMPETITION_LOCATION,
      status: CompetitionStatus.WEIGH_IN,
      organizerId: organizer.id,
      matchDuration: 240,
    },
  });
  console.log(`Created competition: ${competition.name}`);

  // Create 4 mats up front (the typical regional setup)
  for (let i = 1; i <= 4; i++) {
    const pin = String(Math.floor(100_000 + Math.random() * 900_000));
    await prisma.mat.create({
      data: { competitionId: competition.id, number: i, pin },
    });
  }
  console.log('Created 4 mats with random PINs');

  let total = 0;
  let categoryCount = 0;

  for (const tier of WEIGHT_TIERS) {
    for (const band of tier.bands) {
      const count = competitorsPerCategory();
      categoryCount++;

      for (let i = 0; i < count; i++) {
        const isMale = tier.gender === Gender.MALE;
        const firstName = pick(isMale ? FIRST_NAMES_M : FIRST_NAMES_F);
        const lastName = pick(LAST_NAMES);
        const club = pick(CLUBS);
        const dob = dobForAgeGroup(tier.ageGroup, COMPETITION_DATE);
        const weight = weightInBand(band.min, band.max);
        const belt = pickBelt(tier.ageGroup);
        const emailUser = `${firstName.toLowerCase().replace(/\W/g, '')}.${lastName.toLowerCase().replace(/\W/g, '')}.${total}`;

        await prisma.competitor.create({
          data: {
            competitionId: competition.id,
            firstName,
            lastName,
            email: `${emailUser}@example.com`,
            dateOfBirth: dob,
            gender: tier.gender,
            weight,
            belt,
            club,
            registrationStatus: RegistrationStatus.WEIGHED_IN,
          },
        });

        total++;
      }

      console.log(`  ${tier.ageGroup} ${tier.gender} ${band.label}kg → ${count} competitors`);
    }
  }

  console.log('');
  console.log(`Done. ${total} competitors across ${categoryCount} weight classes, in 4 mats.`);
  console.log(`Competition: "${competition.name}"`);
  console.log(`Status: WEIGH_IN — open the dashboard, click Generate Categories, then Generate Brackets.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
