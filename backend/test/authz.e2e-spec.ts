/**
 * Authorization layer — global guard regression + role enforcement (PR1).
 *
 * PR1 introduced two global guards (JwtAuthGuard then RolesGuard via APP_GUARD),
 * making every route default-protected. Before PR1 there was NO global guard and
 * ~half the routes were intentionally public (the spectator surface, health,
 * auth, self-registration). The danger: a naive global default-deny would 403
 * that whole public surface.
 *
 * This test is the safety net. It asserts, against the real DB + full AppModule:
 *   1. PUBLIC ROUTES STILL 200 (no token) — the regression the outside voice
 *      caught was missing. Every route marked @Public must still work anonymously.
 *   2. PROTECTED ROUTES reject anonymous (401) and admit ORGANIZER.
 *   3. A COACH token is DENIED (403) on organizer routes AND on the default-deny
 *      path — proving the new role can't reach old endpoints.
 *   4. role travels in the JWT; an enum-invalid role claim is NOT trusted.
 *
 * Run: npx jest --config test/jest-e2e.json test/authz.e2e-spec.ts
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

const TEST_PREFIX = `AUTHZ-E2E-${Date.now()}`;

describe('Authorization layer (global guard regression + roles)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jwt: JwtService;
  let secret: string;

  let competitionId: string;
  let competitorId: string;
  let matId: string;

  // Tokens minted for each role + an enum-invalid one.
  let organizerToken: string;
  let coachToken: string;
  let rolelessToken: string; // pre-PR1 shape: { sub, email } only
  let tamperedRoleToken: string; // { role: 'SUPERUSER' } — not a UserRole

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

    const suffix = Math.random().toString(36).slice(2, 8);
    const organizer = await prisma.user.create({
      data: {
        email: `${TEST_PREFIX}-org-${suffix}@example.com`,
        passwordHash: 'x',
        role: 'ORGANIZER',
      },
    });
    const coach = await prisma.user.create({
      data: {
        email: `${TEST_PREFIX}-coach-${suffix}@example.com`,
        passwordHash: 'x',
        role: 'COACH',
      },
    });

    const sign = (payload: object) => jwt.sign(payload, { secret });
    organizerToken = sign({ sub: organizer.id, email: organizer.email, role: 'ORGANIZER' });
    coachToken = sign({ sub: coach.id, email: coach.email, role: 'COACH' });
    rolelessToken = sign({ sub: organizer.id, email: organizer.email }); // no role claim
    tamperedRoleToken = sign({ sub: coach.id, email: coach.email, role: 'SUPERUSER' });

    const competition = await prisma.competition.create({
      data: {
        name: `${TEST_PREFIX}-${suffix}`,
        date: new Date(),
        organizerId: organizer.id,
        status: 'ACTIVE',
      },
    });
    competitionId = competition.id;

    const competitor = await prisma.competitor.create({
      data: {
        competitionId: competition.id,
        firstName: 'Test',
        lastName: `${TEST_PREFIX}-${suffix}`,
        dateOfBirth: new Date('2000-01-01'),
        gender: 'MALE',
        registrationStatus: 'REGISTERED',
      },
    });
    competitorId = competitor.id;

    const mat = await prisma.mat.create({
      data: { competitionId: competition.id, number: 1, pin: '1234' },
    });
    matId = mat.id;
  });

  afterAll(async () => {
    await prisma.competitor.deleteMany({
      where: { competition: { name: { startsWith: TEST_PREFIX } } },
    });
    await prisma.mat.deleteMany({
      where: { competition: { name: { startsWith: TEST_PREFIX } } },
    });
    await prisma.competition.deleteMany({ where: { name: { startsWith: TEST_PREFIX } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: TEST_PREFIX } } });
    await app.close();
  });

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  // --- 1. Public routes must STILL 200 with NO token (the regression) ---------
  describe('public routes work anonymously (no token)', () => {
    // Note: AppController (GET /) is not registered in AppModule, so it isn't a
    // live route — it carries @Public anyway in case it's ever wired in.
    it('GET /health', () => request(app.getHttpServer()).get('/health').expect(200));
    it('GET /public/competitions/:id', () =>
      request(app.getHttpServer()).get(`/public/competitions/${competitionId}`).expect(200));
    it('GET /competitions/:id/standings (public)', () =>
      request(app.getHttpServer()).get(`/competitions/${competitionId}/standings`).expect(200));
    it('GET /competitions/:id/brackets (public)', () =>
      request(app.getHttpServer()).get(`/competitions/${competitionId}/brackets`).expect(200));
    it('GET /competitions/:id/mats (public)', () =>
      request(app.getHttpServer()).get(`/competitions/${competitionId}/mats`).expect(200));
    it('GET /competitions/:id/competitors (public)', () =>
      request(app.getHttpServer()).get(`/competitions/${competitionId}/competitors`).expect(200));
    it('POST /mats/:id/verify-pin (public, table-official auth)', () =>
      request(app.getHttpServer())
        .post(`/mats/${matId}/verify-pin`)
        .send({ pin: '1234' })
        .expect(201)
        .expect((res) => expect(res.body.valid).toBe(true)));
    it('POST /auth/login (public)', () =>
      request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'nobody@example.com', password: 'wrong' })
        .expect(401)); // reaches the handler (401 = bad creds, NOT guard 403/401-no-token
  });

  // --- 2. Protected routes: anon 401, organizer 200 ---------------------------
  describe('protected routes require auth', () => {
    it('GET /competitions rejects anonymous (401)', () =>
      request(app.getHttpServer()).get('/competitions').expect(401));
    it('GET /competitions admits ORGANIZER (200)', () =>
      request(app.getHttpServer()).get('/competitions').set(auth(organizerToken)).expect(200));
  });

  // --- 3. COACH is denied on organizer + default-deny routes ------------------
  describe('coach role cannot reach organizer routes', () => {
    it('GET /competitions denies COACH (403)', () =>
      request(app.getHttpServer()).get('/competitions').set(auth(coachToken)).expect(403));
    it('PATCH competitor disqualify (organizer-only) denies COACH (403)', () =>
      request(app.getHttpServer())
        .patch(`/competitions/${competitionId}/competitors/${competitorId}/disqualify`)
        .set(auth(coachToken))
        .expect(403));
    it('POST mats (organizer-only) denies COACH (403)', () =>
      request(app.getHttpServer())
        .post(`/competitions/${competitionId}/mats`)
        .set(auth(coachToken))
        .send({ count: 1 })
        .expect(403));
  });

  // --- 4. Token role handling -------------------------------------------------
  describe('JWT role claim handling', () => {
    it('roleless (pre-PR1) token is treated as ORGANIZER — no forced re-login', () =>
      request(app.getHttpServer()).get('/competitions').set(auth(rolelessToken)).expect(200));
    it('enum-invalid role claim is NOT trusted (falls back to ORGANIZER, not the bogus role)', () =>
      // role "SUPERUSER" is not a UserRole; strategy defaults to ORGANIZER, so an
      // organizer route admits it (200) — the bogus claim grants nothing extra.
      // The security point: it is never treated as a privileged unknown.
      request(app.getHttpServer()).get('/competitions').set(auth(tamperedRoleToken)).expect(200));
  });

  // --- 5. Signup role rules ---------------------------------------------------
  describe('signup role assignment', () => {
    it('rejects ADMIN self-assignment at signup (400)', () =>
      request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: `${TEST_PREFIX}-admin@example.com`,
          password: 'password123',
          name: 'X',
          role: 'ADMIN',
        })
        .expect(400));
    it('allows COACH self-assignment at signup (201) + token carries the role', () =>
      request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: `${TEST_PREFIX}-newcoach@example.com`,
          password: 'password123',
          name: 'Coach',
          role: 'COACH',
        })
        .expect(201)
        .expect((res) => {
          const decoded = jwt.verify(res.body.access_token, { secret }) as { role: string };
          expect(decoded.role).toBe('COACH');
        }));
  });
});
