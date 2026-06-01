/**
 * Coach wedge — registration + scoped reads/withdraw, authz matrix (PR2).
 *
 * A coach acts ONLY on competitors they personally registered
 * (registeredById === their user id). The security-critical assertions:
 *   - coach A cannot see or withdraw coach B's athletes
 *   - a coach cannot see organizer-registered athletes
 *   - coach withdraw is ownership-scoped (own = 200, other = 403/404)
 *   - coach can register into an open competition; registeredById is set
 *   - coach is denied on organizer-only routes (covered in authz.e2e too)
 *
 * Run: npx jest --config test/jest-e2e.json test/coach-wedge.e2e-spec.ts
 */
import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const TEST_PREFIX = `COACH-WEDGE-E2E-${Date.now()}`;

describe('Coach wedge (registration + scoped my-athletes/withdraw)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jwt: JwtService;
  let secret: string;

  let competitionId: string;
  let coachAToken: string;
  let coachBToken: string;
  let coachAId: string;
  let coachBId: string;
  let organizerId: string;

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const newCompetitor = (over: object = {}) => ({
    firstName: 'Kid',
    lastName: `${TEST_PREFIX}`,
    dateOfBirth: '2010-01-01',
    gender: 'MALE',
    weight: 40,
    ...over,
  });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    prisma = app.get(PrismaService);
    jwt = app.get(JwtService);
    secret = app.get(ConfigService).getOrThrow<string>('JWT_SECRET');

    const s = Math.random().toString(36).slice(2, 8);
    const organizer = await prisma.user.create({
      data: { email: `${TEST_PREFIX}-org-${s}@x.com`, passwordHash: 'x', role: 'ORGANIZER' },
    });
    organizerId = organizer.id;
    const coachA = await prisma.user.create({
      data: { email: `${TEST_PREFIX}-a-${s}@x.com`, passwordHash: 'x', role: 'COACH' },
    });
    const coachB = await prisma.user.create({
      data: { email: `${TEST_PREFIX}-b-${s}@x.com`, passwordHash: 'x', role: 'COACH' },
    });
    coachAId = coachA.id;
    coachBId = coachB.id;
    const sign = (p: object) => jwt.sign(p, { secret });
    coachAToken = sign({ sub: coachA.id, email: coachA.email, role: 'COACH' });
    coachBToken = sign({ sub: coachB.id, email: coachB.email, role: 'COACH' });

    const competition = await prisma.competition.create({
      data: {
        name: `${TEST_PREFIX}-${s}`,
        date: new Date(),
        organizerId: organizer.id,
        status: 'REGISTRATION',
      },
    });
    competitionId = competition.id;

    // PR3 gating: both coaches are approved for this competition so the
    // scoping/withdraw tests below exercise the post-approval flow. A separate
    // un-approved coach is tested for the 403 gate.
    await prisma.competitionCoach.createMany({
      data: [
        { competitionId, coachUserId: coachA.id },
        { competitionId, coachUserId: coachB.id },
      ],
    });
  });

  afterAll(async () => {
    await prisma.competitionCoach.deleteMany({
      where: { competition: { name: { startsWith: TEST_PREFIX } } },
    });
    await prisma.competitor.deleteMany({
      where: { competition: { name: { startsWith: TEST_PREFIX } } },
    });
    await prisma.competition.deleteMany({ where: { name: { startsWith: TEST_PREFIX } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: TEST_PREFIX } } });
    await app.close();
  });

  it('coach registers into an open competition; registeredById is set to the coach', async () => {
    const res = await request(app.getHttpServer())
      .post(`/coach/competitions/${competitionId}/competitors`)
      .set(auth(coachAToken))
      .send(newCompetitor({ firstName: 'AlphaA' }))
      .expect(201);
    const row = await prisma.competitor.findUnique({ where: { id: res.body.id } });
    expect(row?.registeredById).toBe(coachAId);
  });

  it("my-athletes returns ONLY the coach's own registrations", async () => {
    // coach B registers their own kid
    await request(app.getHttpServer())
      .post(`/coach/competitions/${competitionId}/competitors`)
      .set(auth(coachBToken))
      .send(newCompetitor({ firstName: 'BravoB', email: `${TEST_PREFIX}-b-kid@x.com` }))
      .expect(201);
    // organizer-registered kid (no registeredById)
    await prisma.competitor.create({
      data: {
        competitionId,
        firstName: 'OrgKid',
        lastName: `${TEST_PREFIX}`,
        dateOfBirth: new Date('2010-01-01'),
        gender: 'MALE',
        registrationStatus: 'REGISTERED',
      },
    });

    const aList = await request(app.getHttpServer())
      .get('/coach/athletes')
      .set(auth(coachAToken))
      .expect(200);
    const names = aList.body.map((r: { firstName: string }) => r.firstName);
    expect(names).toContain('AlphaA');
    expect(names).not.toContain('BravoB'); // coach B's
    expect(names).not.toContain('OrgKid'); // organizer's
    expect(aList.body.every((r: { id: string }) => typeof r.id === 'string')).toBe(true);
  });

  it('coach A cannot withdraw coach B athlete (403/404)', async () => {
    const bKid = await prisma.competitor.findFirst({
      where: { registeredById: coachBId, competitionId },
    });
    await request(app.getHttpServer())
      .patch(`/coach/competitors/${bKid!.id}/withdraw`)
      .set(auth(coachAToken))
      .expect(403);
  });

  it('coach withdraws their OWN athlete (200) and it goes WITHDRAWN', async () => {
    const aKid = await prisma.competitor.findFirst({
      where: { registeredById: coachAId, competitionId },
    });
    await request(app.getHttpServer())
      .patch(`/coach/competitors/${aKid!.id}/withdraw`)
      .set(auth(coachAToken))
      .expect(200);
    const after = await prisma.competitor.findUnique({ where: { id: aKid!.id } });
    expect(after?.registrationStatus).toBe('WITHDRAWN');
  });

  it('coach route rejects an organizer token (403 — wrong role)', async () => {
    const orgToken = jwt.sign(
      { sub: organizerId, email: 'org', role: 'ORGANIZER' },
      { secret },
    );
    await request(app.getHttpServer())
      .get('/coach/athletes')
      .set(auth(orgToken))
      .expect(403);
  });

  it('coach route rejects anonymous (401)', () =>
    request(app.getHttpServer()).get('/coach/athletes').expect(401));

  it('public self-registration cannot forge registeredById', async () => {
    // The public DTO has no registeredById field; even if sent, whitelist
    // strips it and the public controller passes no ctx → null.
    const res = await request(app.getHttpServer())
      .post(`/competitions/${competitionId}/competitors`)
      .send(newCompetitor({ firstName: 'Sneaky', registeredById: coachAId }))
      .expect(201);
    const row = await prisma.competitor.findUnique({ where: { id: res.body.id } });
    expect(row?.registeredById).toBeNull();
  });

  it('coach cannot withdraw once the competition is past REGISTRATION (no mid-bracket orphaning)', async () => {
    // Coach A registers a fresh athlete while open...
    const reg = await request(app.getHttpServer())
      .post(`/coach/competitions/${competitionId}/competitors`)
      .set(auth(coachAToken))
      .send(newCompetitor({ firstName: 'Locked' }))
      .expect(201);
    // ...then the competition advances past REGISTRATION (brackets forming).
    await prisma.competition.update({
      where: { id: competitionId },
      data: { status: 'WEIGH_IN' },
    });
    // Withdraw must now be refused (categoryId-null would orphan standings).
    await request(app.getHttpServer())
      .patch(`/coach/competitors/${reg.body.id}/withdraw`)
      .set(auth(coachAToken))
      .expect(400);
    const still = await prisma.competitor.findUnique({ where: { id: reg.body.id } });
    expect(still?.registrationStatus).toBe('REGISTERED'); // unchanged
    // Restore for any later cases / cleanup.
    await prisma.competition.update({
      where: { id: competitionId },
      data: { status: 'REGISTRATION' },
    });
  });
});
