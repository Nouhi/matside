/**
 * Public spectator endpoints — anonymous-access integration test.
 *
 * The spectator URL (`/competition/:id/live` on the frontend) is meant to be
 * shared with families and fans who are NOT logged in. The endpoints it
 * consumes — `/public/competitions/:id` and `/public/competitions/:id/schedule`
 * — must therefore work without an Authorization header.
 *
 * This test boots the full AppModule via supertest and hits both endpoints
 * with no auth header. It asserts:
 *   - both endpoints return 200 (not 401)
 *   - the equivalent organizer endpoint (`/competitions/:id`) returns 401
 *     in the same setup — proving auth is wired up, so the public 200s aren't
 *     a false positive from auth being globally disabled in test mode.
 *
 * The competition + mat fixtures are namespaced by `TEST_PREFIX` so partial
 * runs never pollute manual testing data; `afterAll` deletes everything by
 * prefix even if individual cases fail.
 *
 * Run with:
 *   npx jest --config test/jest-e2e.json test/public-spectator.e2e-spec.ts
 */
import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const TEST_PREFIX = `PUBLIC-SPEC-E2E-${Date.now()}`;

describe('Public spectator endpoints (anonymous-access integration)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let competitionId: string;
  let matchId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    // Mirror main.ts so the test exercises the same pipe config that prod does.
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    prisma = app.get(PrismaService);

    // Minimal fixture: organizer + competition + category + competitor pair +
    // mat + an ACTIVE match assigned to that mat. Just enough state for the
    // schedule endpoint to return a non-empty `currentMatch`.
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
    competitionId = competition.id;

    const category = await prisma.category.create({
      data: {
        competitionId: competition.id,
        name: `${TEST_PREFIX}-cat-${suffix}`,
        gender: 'MALE',
        ageGroup: 'SENIOR',
        minWeight: 66,
        maxWeight: 73,
        bracketType: 'ROUND_ROBIN',
      },
    });
    const c1 = await prisma.competitor.create({
      data: {
        competitionId: competition.id,
        categoryId: category.id,
        firstName: 'Hiroshi',
        lastName: `${TEST_PREFIX}-${suffix}`,
        dateOfBirth: new Date('2000-01-01'),
        gender: 'MALE',
        weight: 72.5,
        registrationStatus: 'WEIGHED_IN',
      },
    });
    const c2 = await prisma.competitor.create({
      data: {
        competitionId: competition.id,
        categoryId: category.id,
        firstName: 'Kenji',
        lastName: `${TEST_PREFIX}-${suffix}`,
        dateOfBirth: new Date('2000-01-01'),
        gender: 'MALE',
        weight: 71,
        registrationStatus: 'WEIGHED_IN',
      },
    });
    const mat = await prisma.mat.create({
      data: { competitionId: competition.id, number: 1, pin: '1234' },
    });
    const match = await prisma.match.create({
      data: {
        categoryId: category.id,
        matId: mat.id,
        competitor1Id: c1.id,
        competitor2Id: c2.id,
        status: 'ACTIVE',
        round: 1,
        poolPosition: 1,
        sequenceNum: 1,
        scores: {
          competitor1: { wazaAri: 1, yuko: 0, shido: 0 },
          competitor2: { wazaAri: 0, yuko: 0, shido: 1 },
        },
      },
    });
    matchId = match.id;
    await prisma.mat.update({ where: { id: mat.id }, data: { currentMatchId: match.id } });
  });

  afterAll(async () => {
    // Cleanup. Order matters because of FKs: clear mat.currentMatchId before
    // deleting matches, then delete matches → competitors → categories →
    // mats → competition → user. Use the prefix to avoid touching anything
    // else in the dev DB.
    await prisma.mat.updateMany({
      where: { competition: { name: { startsWith: TEST_PREFIX } } },
      data: { currentMatchId: null },
    });
    await prisma.match.deleteMany({
      where: { category: { competition: { name: { startsWith: TEST_PREFIX } } } },
    });
    await prisma.competitor.deleteMany({
      where: { competition: { name: { startsWith: TEST_PREFIX } } },
    });
    await prisma.category.deleteMany({
      where: { competition: { name: { startsWith: TEST_PREFIX } } },
    });
    await prisma.mat.deleteMany({
      where: { competition: { name: { startsWith: TEST_PREFIX } } },
    });
    await prisma.competition.deleteMany({ where: { name: { startsWith: TEST_PREFIX } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: TEST_PREFIX } } });

    await app.close();
  });

  it('GET /public/competitions/:id — anonymous request returns 200, not 401', async () => {
    const response = await request(app.getHttpServer())
      .get(`/public/competitions/${competitionId}`)
      .expect(200);

    expect(response.body).toMatchObject({
      id: competitionId,
      status: 'ACTIVE',
      competitorCount: 2,
      categoryCount: 1,
      matCount: 1,
    });
    // No PII / secrets leak.
    const json = JSON.stringify(response.body);
    expect(json).not.toContain('organizerId');
    expect(json).not.toContain('passwordHash');
    expect(json).not.toContain('"pin"');
  });

  it('GET /public/competitions/:id/schedule — anonymous request returns 200 with live-scoring fields, not 401', async () => {
    const response = await request(app.getHttpServer())
      .get(`/public/competitions/${competitionId}/schedule`)
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body).toHaveLength(1);
    const mat = response.body[0];
    expect(mat.number).toBe(1);
    expect(mat.currentMatch).toBeTruthy();
    expect(mat.currentMatch.id).toBe(matchId);
    expect(mat.currentMatch.status).toBe('ACTIVE');
    // The B+ scope: scoring fields must flow through the public projection
    // so SpectatorPage can render a real scoreboard, not just a schedule.
    expect(mat.currentMatch.scores).toEqual({
      competitor1: { wazaAri: 1, yuko: 0, shido: 0 },
      competitor2: { wazaAri: 0, yuko: 0, shido: 1 },
    });
    expect(mat.currentMatch.goldenScore).toBe(false);
    expect(mat.currentMatch.winMethod).toBeNull();
    expect(mat.currentMatch).toHaveProperty('winner'); // present even when null
    // Anonymous-safe: no pin, no email, no secret hashes anywhere.
    const json = JSON.stringify(response.body);
    expect(json).not.toContain('"pin"');
    expect(json).not.toContain('email');
    expect(json).not.toContain('passwordHash');
  });

  it('GET /competitions/:id (organizer endpoint) — anonymous request returns 401 in the SAME setup', async () => {
    // Sanity check: if the public 200s above were caused by auth being
    // globally disabled in test mode, this would also return 200. The 401
    // here proves the JWT guard IS wired up and the public endpoints are
    // genuinely exempt by design (no `@UseGuards` on PublicCompetitionsController).
    await request(app.getHttpServer())
      .get(`/competitions/${competitionId}`)
      .expect(401);
  });
});
