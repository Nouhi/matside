/**
 * Coach gating — organizer approval of coaches (PR3).
 *
 * A coach can only register into competitions an organizer has approved them
 * for (a CompetitionCoach link). Security assertions:
 *   - un-approved coach registering → 403 (even into an open competition)
 *   - approving by email links them; then register → 201
 *   - removing access → coach denied again; past registrations survive
 *   - add-coach is enumeration-safe: same response for unknown email vs real coach
 *   - only the organizer who owns the competition can manage its coaches
 *   - the coach's registrable-competitions list = approved ∩ open only
 *
 * Run: npx jest --config test/jest-e2e.json test/coach-gating.e2e-spec.ts
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

const TEST_PREFIX = `COACH-GATE-E2E-${Date.now()}`;

describe('Coach gating (organizer approval)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jwt: JwtService;
  let secret: string;

  let competitionId: string;
  let organizerToken: string;
  let otherOrganizerToken: string;
  let coachToken: string;
  let coachId: string;
  let coachEmail: string;
  let otherOrganizerEmail: string;

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const newCompetitor = (over: object = {}) => ({
    firstName: 'Kid',
    lastName: TEST_PREFIX,
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
    otherOrganizerEmail = `${TEST_PREFIX}-org2-${s}@x.com`;
    const other = await prisma.user.create({
      data: { email: otherOrganizerEmail, passwordHash: 'x', role: 'ORGANIZER' },
    });
    coachEmail = `${TEST_PREFIX}-coach-${s}@x.com`;
    const coach = await prisma.user.create({
      data: { email: coachEmail, passwordHash: 'x', role: 'COACH' },
    });
    coachId = coach.id;

    const sign = (p: object) => jwt.sign(p, { secret });
    organizerToken = sign({ sub: organizer.id, email: organizer.email, role: 'ORGANIZER' });
    otherOrganizerToken = sign({ sub: other.id, email: other.email, role: 'ORGANIZER' });
    coachToken = sign({ sub: coach.id, email: coach.email, role: 'COACH' });

    const competition = await prisma.competition.create({
      data: {
        name: `${TEST_PREFIX}-${s}`,
        date: new Date(),
        organizerId: organizer.id,
        status: 'REGISTRATION',
      },
    });
    competitionId = competition.id;
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

  it('un-approved coach cannot register (403) even into an open competition', () =>
    request(app.getHttpServer())
      .post(`/coach/competitions/${competitionId}/competitors`)
      .set(auth(coachToken))
      .send(newCompetitor())
      .expect(403));

  it("un-approved coach's registrable list is empty", () =>
    request(app.getHttpServer())
      .get('/coach/competitions')
      .set(auth(coachToken))
      .expect(200)
      .expect((r) => expect(r.body).toHaveLength(0)));

  it('only the owning organizer can manage coaches (other organizer → 403)', () =>
    request(app.getHttpServer())
      .post(`/competitions/${competitionId}/coaches`)
      .set(auth(otherOrganizerToken))
      .send({ email: coachEmail })
      .expect(403));

  it('a non-owning organizer cannot list a competition’s coaches (403)', () =>
    request(app.getHttpServer())
      .get(`/competitions/${competitionId}/coaches`)
      .set(auth(otherOrganizerToken))
      .expect(403));

  it('a non-owning organizer cannot revoke a coach (403)', () =>
    request(app.getHttpServer())
      .delete(`/competitions/${competitionId}/coaches/${coachId}`)
      .set(auth(otherOrganizerToken))
      .expect(403));

  it('add-coach is enumeration-safe: unknown email returns the same shape (added:false)', () =>
    request(app.getHttpServer())
      .post(`/competitions/${competitionId}/coaches`)
      .set(auth(organizerToken))
      .send({ email: `${TEST_PREFIX}-nobody@x.com` })
      .expect(201)
      .expect((r) => expect(r.body).toEqual({ added: false })));

  it('add-coach with a real NON-coach email (an organizer) returns added:false, no link', async () => {
    // Enumeration-safety must hold for the wrong-role case too: an email that
    // belongs to a real account but isn't a COACH must look identical to an
    // unknown email — same {added:false}, and no CompetitionCoach row created.
    await request(app.getHttpServer())
      .post(`/competitions/${competitionId}/coaches`)
      .set(auth(organizerToken))
      .send({ email: otherOrganizerEmail })
      .expect(201)
      .expect((r) => expect(r.body).toEqual({ added: false }));
    const links = await prisma.competitionCoach.count({
      where: { competitionId, coach: { email: otherOrganizerEmail } },
    });
    expect(links).toBe(0);
  });

  it('organizer approves the coach by email (added:true)', () =>
    request(app.getHttpServer())
      .post(`/competitions/${competitionId}/coaches`)
      .set(auth(organizerToken))
      .send({ email: coachEmail })
      .expect(201)
      .expect((r) => expect(r.body).toEqual({ added: true })));

  it('approving again is idempotent (still added:true, no duplicate)', async () => {
    await request(app.getHttpServer())
      .post(`/competitions/${competitionId}/coaches`)
      .set(auth(organizerToken))
      .send({ email: coachEmail })
      .expect(201)
      .expect((r) => expect(r.body).toEqual({ added: true }));
    const count = await prisma.competitionCoach.count({
      where: { competitionId, coachUserId: coachId },
    });
    expect(count).toBe(1);
  });

  it('approved coach can now register (201) and the competition shows in their list', async () => {
    await request(app.getHttpServer())
      .post(`/coach/competitions/${competitionId}/competitors`)
      .set(auth(coachToken))
      .send(newCompetitor({ firstName: 'Approved' }))
      .expect(201);
    await request(app.getHttpServer())
      .get('/coach/competitions')
      .set(auth(coachToken))
      .expect(200)
      .expect((r) => {
        expect(r.body).toHaveLength(1);
        expect(r.body[0].id).toBe(competitionId);
      });
  });

  it('organizer lists approved coaches', () =>
    request(app.getHttpServer())
      .get(`/competitions/${competitionId}/coaches`)
      .set(auth(organizerToken))
      .expect(200)
      .expect((r) => {
        expect(r.body).toHaveLength(1);
        expect(r.body[0].email).toBe(coachEmail);
      }));

  it('removing access denies the coach again but past registrations survive', async () => {
    const before = await prisma.competitor.count({
      where: { registeredById: coachId, competitionId },
    });
    expect(before).toBe(1);

    await request(app.getHttpServer())
      .delete(`/competitions/${competitionId}/coaches/${coachId}`)
      .set(auth(organizerToken))
      .expect(200)
      .expect((r) => expect(r.body).toEqual({ removed: true }));

    // Coach denied again
    await request(app.getHttpServer())
      .post(`/coach/competitions/${competitionId}/competitors`)
      .set(auth(coachToken))
      .send(newCompetitor({ firstName: 'Denied' }))
      .expect(403);

    // Past registration still there
    const after = await prisma.competitor.count({
      where: { registeredById: coachId, competitionId },
    });
    expect(after).toBe(1);
  });
});
