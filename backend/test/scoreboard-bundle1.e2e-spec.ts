/**
 * Bundle 1 end-to-end smoke test.
 *
 * Boots a real Prisma client against the dev Postgres and drives the full
 * `applyScoreEvent` / `advanceWinner` chain through the transaction wrap
 * (ENG-A2). The mocked unit tests in `scoreboard.service.spec.ts` prove the
 * code calls `$transaction` correctly. This test proves the resulting SQL
 * actually commits + advances + survives real FK constraints.
 *
 * Run with:
 *   npx jest --config test/jest-e2e.json test/scoreboard-bundle1.e2e-spec.ts
 *
 * Uses an ephemeral test scope: every record created here is namespaced by
 * the `TEST_PREFIX` constant so a partial run never pollutes manual testing
 * data. The afterAll block deletes everything by prefix even if individual
 * cases fail.
 */
// Load .env before any imports that touch process.env.DATABASE_URL.
// The main app picks this up via @nestjs/config; the test instantiates
// PrismaService directly without ConfigModule, so we load explicitly.
import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { WinMethod } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { ScoreboardService } from '../src/scoreboard/scoreboard.service';
import { MatchScores } from '../src/scoreboard/scoreboard.types';

const TEST_PREFIX = `BUNDLE1-E2E-${Date.now()}`;

describe('Bundle 1 integration (real Postgres)', () => {
  let prisma: PrismaService;
  let service: ScoreboardService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PrismaService, ScoreboardService],
    }).compile();

    prisma = module.get<PrismaService>(PrismaService);
    service = module.get<ScoreboardService>(ScoreboardService);
    await prisma.$connect();
  });

  afterAll(async () => {
    // Cleanup. Order matters because of FKs. Match→Competitor→Category→
    // Competition→User. Use the prefix to avoid touching anything else.
    await prisma.match.deleteMany({ where: { category: { competition: { name: { startsWith: TEST_PREFIX } } } } });
    await prisma.competitor.deleteMany({ where: { competition: { name: { startsWith: TEST_PREFIX } } } });
    await prisma.category.deleteMany({ where: { competition: { name: { startsWith: TEST_PREFIX } } } });
    await prisma.competition.deleteMany({ where: { name: { startsWith: TEST_PREFIX } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: TEST_PREFIX } } });
    await prisma.$disconnect();
  });

  // ---------------------------------------------------------------
  // Fixture helpers
  // ---------------------------------------------------------------
  async function makeFixture(opts: { competitorCount: number; bracketType?: 'ROUND_ROBIN' | 'SINGLE_REPECHAGE' }) {
    const suffix = Math.random().toString(36).slice(2, 8);
    const user = await prisma.user.create({
      data: {
        email: `${TEST_PREFIX}-${suffix}@example.com`,
        passwordHash: 'not-a-real-hash',
        role: 'ORGANIZER',
      },
    });
    const competition = await prisma.competition.create({
      data: {
        name: `${TEST_PREFIX}-${suffix}`,
        date: new Date(),
        organizerId: user.id,
        status: 'ACTIVE',
      },
    });
    const category = await prisma.category.create({
      data: {
        competitionId: competition.id,
        name: `${TEST_PREFIX}-cat-${suffix}`,
        gender: 'MALE',
        ageGroup: 'SENIOR',
        minWeight: 60,
        maxWeight: 73,
        bracketType: opts.bracketType ?? 'ROUND_ROBIN',
      },
    });
    const competitors = await Promise.all(
      Array.from({ length: opts.competitorCount }).map((_, i) =>
        prisma.competitor.create({
          data: {
            competitionId: competition.id,
            categoryId: category.id,
            firstName: `Comp${i + 1}`,
            lastName: suffix,
            dateOfBirth: new Date('2000-01-01'),
            gender: 'MALE',
            weight: 70,
            registrationStatus: 'WEIGHED_IN',
          },
        }),
      ),
    );
    return { user, competition, category, competitors };
  }

  async function makeMatch(categoryId: string, c1Id: string, c2Id: string, round = 1, poolPosition = 1) {
    return prisma.match.create({
      data: {
        categoryId,
        competitor1Id: c1Id,
        competitor2Id: c2Id,
        round,
        poolPosition,
        sequenceNum: round * 100 + poolPosition,
        status: 'ACTIVE',
        scores: { competitor1: { wazaAri: 0, yuko: 0, shido: 0 }, competitor2: { wazaAri: 0, yuko: 0, shido: 0 } },
      },
    });
  }

  // ---------------------------------------------------------------
  // Scenario 1: 2 waza-ari → auto IPPON, transaction commits
  // ---------------------------------------------------------------
  it('scenario 1: scoring 2 waza-ari auto-terminates as IPPON and writes the full row', async () => {
    const { category, competitors } = await makeFixture({ competitorCount: 2 });
    const match = await makeMatch(category.id, competitors[0].id, competitors[1].id);

    // First waza-ari: should not terminate.
    let result = await service.applyScoreEvent(match.id, {
      type: 'WAZA_ARI',
      competitorId: competitors[0].id,
      timestamp: Date.now(),
    });
    expect(result.terminated).toBe(false);

    // Reload to verify the JSON column wrote correctly with all three fields.
    const after1 = await prisma.match.findUnique({ where: { id: match.id } });
    const scores1 = after1!.scores as unknown as MatchScores;
    expect(scores1.competitor1.wazaAri).toBe(1);
    expect(scores1.competitor1.yuko).toBe(0); // ENG-Q1: required field, must be present
    expect(scores1.competitor1.shido).toBe(0);
    expect(after1!.status).toBe('ACTIVE');

    // Second waza-ari → auto IPPON. This exercises the transaction wrap:
    // match.update + advanceWinner all commit atomically.
    result = await service.applyScoreEvent(match.id, {
      type: 'WAZA_ARI',
      competitorId: competitors[0].id,
      timestamp: Date.now(),
    });
    expect(result.terminated).toBe(true);
    expect(result.winMethod).toBe(WinMethod.IPPON);
    expect(result.winnerId).toBe(competitors[0].id);

    // Database side: match is COMPLETED, winner set, winMethod enum stored.
    const after2 = await prisma.match.findUnique({ where: { id: match.id } });
    expect(after2!.status).toBe('COMPLETED');
    expect(after2!.winnerId).toBe(competitors[0].id);
    expect(after2!.winMethod).toBe(WinMethod.IPPON);
    const scores2 = after2!.scores as unknown as MatchScores;
    expect(scores2.competitor1.wazaAri).toBe(2);
  });

  // ---------------------------------------------------------------
  // Scenario 2: SINGLE_REPECHAGE — R1 winner actually advances to R2
  // ---------------------------------------------------------------
  it('scenario 2: SINGLE_REPECHAGE R1 IPPON advances winner into R2 (transaction wrap chain)', async () => {
    const { category, competitors } = await makeFixture({
      competitorCount: 4,
      bracketType: 'SINGLE_REPECHAGE',
    });
    // Two R1 matches feed one R2 match (positions 1,2 → R2 pos 1).
    const r1m1 = await makeMatch(category.id, competitors[0].id, competitors[1].id, 1, 1);
    await makeMatch(category.id, competitors[2].id, competitors[3].id, 1, 2);
    const r2 = await prisma.match.create({
      data: {
        categoryId: category.id,
        round: 2,
        poolPosition: 1,
        sequenceNum: 200,
        status: 'SCHEDULED',
        scores: { competitor1: { wazaAri: 0, yuko: 0, shido: 0 }, competitor2: { wazaAri: 0, yuko: 0, shido: 0 } },
      },
    });

    // Direct IPPON in R1 match 1 — terminates and chains into advanceWinner,
    // which should fill R2.competitor1 (position 1 is odd → comp1 slot).
    const result = await service.applyScoreEvent(r1m1.id, {
      type: 'IPPON',
      competitorId: competitors[0].id,
      timestamp: Date.now(),
    });
    expect(result.terminated).toBe(true);
    expect(result.winMethod).toBe(WinMethod.IPPON);

    // The transaction wrapped the chain. If the wrap is broken, either R1
    // commits without R2 getting filled (partial write), or the whole thing
    // rolls back. Either way, this assertion catches it.
    const r2After = await prisma.match.findUnique({ where: { id: r2.id } });
    expect(r2After!.competitor1Id).toBe(competitors[0].id);
    expect(r2After!.competitor2Id).toBeNull(); // R1 match 2 hasn't completed yet

    const r1After = await prisma.match.findUnique({ where: { id: r1m1.id } });
    expect(r1After!.status).toBe('COMPLETED');
    expect(r1After!.winnerId).toBe(competitors[0].id);
  });

  // ---------------------------------------------------------------
  // Scenario 3: 3 shidos → HANSOKU_MAKE auto-termination (opponent wins)
  // ---------------------------------------------------------------
  it('scenario 3: 3rd shido on c1 terminates as HANSOKU_MAKE with c2 as winner', async () => {
    const { category, competitors } = await makeFixture({ competitorCount: 2 });
    const match = await makeMatch(category.id, competitors[0].id, competitors[1].id);

    // First and second shidos: no termination.
    await service.applyScoreEvent(match.id, { type: 'SHIDO', competitorId: competitors[0].id, timestamp: Date.now() });
    const r2 = await service.applyScoreEvent(match.id, { type: 'SHIDO', competitorId: competitors[0].id, timestamp: Date.now() });
    expect(r2.terminated).toBe(false);

    // Third shido: HANSOKU_MAKE. c2 wins by disqualification.
    const r3 = await service.applyScoreEvent(match.id, {
      type: 'SHIDO',
      competitorId: competitors[0].id,
      timestamp: Date.now(),
    });
    expect(r3.terminated).toBe(true);
    expect(r3.winMethod).toBe(WinMethod.HANSOKU_MAKE);
    expect(r3.winnerId).toBe(competitors[1].id);

    const after = await prisma.match.findUnique({ where: { id: match.id } });
    expect(after!.status).toBe('COMPLETED');
    expect(after!.winnerId).toBe(competitors[1].id);
    expect(after!.winMethod).toBe(WinMethod.HANSOKU_MAKE);
    const scores = after!.scores as unknown as MatchScores;
    expect(scores.competitor1.shido).toBe(3);
  });

  // ---------------------------------------------------------------
  // Scenario 4: WinMethod enum + endMatch direct invocation
  // ---------------------------------------------------------------
  it('scenario 4: endMatch with DECISION writes the enum value through the transaction', async () => {
    const { category, competitors } = await makeFixture({ competitorCount: 2 });
    const match = await makeMatch(category.id, competitors[0].id, competitors[1].id);

    const updated = await service.endMatch(match.id, competitors[1].id, WinMethod.DECISION);
    expect(updated.status).toBe('COMPLETED');
    expect(updated.winMethod).toBe(WinMethod.DECISION);
    expect(updated.winnerId).toBe(competitors[1].id);

    const after = await prisma.match.findUnique({ where: { id: match.id } });
    expect(after!.winMethod).toBe(WinMethod.DECISION);
  });

  // ---------------------------------------------------------------
  // Scenario 5: Stale match update does NOT mutate scoreboard state
  // (proves the pre-flight check rejects non-ACTIVE matches before
  // the transaction opens.)
  // ---------------------------------------------------------------
  it('scenario 5: applyScoreEvent on a COMPLETED match throws BadRequestException and does nothing', async () => {
    const { category, competitors } = await makeFixture({ competitorCount: 2 });
    const match = await makeMatch(category.id, competitors[0].id, competitors[1].id);
    // Mark completed manually.
    await prisma.match.update({
      where: { id: match.id },
      data: { status: 'COMPLETED', winnerId: competitors[0].id, winMethod: WinMethod.DECISION },
    });

    await expect(
      service.applyScoreEvent(match.id, { type: 'WAZA_ARI', competitorId: competitors[0].id, timestamp: Date.now() }),
    ).rejects.toThrow('Match is not active');

    // Verify scores untouched.
    const after = await prisma.match.findUnique({ where: { id: match.id } });
    const scores = after!.scores as unknown as MatchScores;
    expect(scores.competitor1.wazaAri).toBe(0);
  });
});
