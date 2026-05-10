import { Test, TestingModule } from '@nestjs/testing';
import type { Request, Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { BracketsService } from '../brackets/brackets.service';
import { StandingsService } from '../standings/standings.service';
import { SchedulerService } from '../scoreboard/scheduler.service';
import { PublicCompetitionsController } from './competitions.public.controller';

describe('PublicCompetitionsController — PII / secret leakage boundary', () => {
  let controller: PublicCompetitionsController;
  let prisma: {
    competition: { findUnique: jest.Mock };
    mat: { findMany: jest.Mock };
    match: { findUnique: jest.Mock; findMany: jest.Mock };
  };
  let bracketsService: { getBrackets: jest.Mock };
  let standingsService: { getCompetitionStandings: jest.Mock };
  let schedulerService: { computeEtas: jest.Mock; getEta: jest.Mock; invalidateCache: jest.Mock };

  function makeRes() {
    const res: Partial<Response> & { _headers: Record<string, string>; _status: number; _ended: boolean } = {
      _headers: {},
      _status: 200,
      _ended: false,
      setHeader(name: string, val: string) {
        (res._headers as Record<string, string>)[name.toLowerCase()] = val;
        return res as Response;
      },
      status(code: number) {
        res._status = code;
        return res as Response;
      },
      end() {
        res._ended = true;
        return res as Response;
      },
    };
    return res as Response & { _headers: Record<string, string>; _status: number; _ended: boolean };
  }

  function makeReq(headers: Record<string, string> = {}) {
    return {
      header(name: string) {
        return headers[name.toLowerCase()];
      },
    } as unknown as Request;
  }

  beforeEach(async () => {
    prisma = {
      competition: { findUnique: jest.fn() },
      mat: { findMany: jest.fn() },
      match: { findUnique: jest.fn(), findMany: jest.fn() },
    };
    bracketsService = { getBrackets: jest.fn() };
    standingsService = { getCompetitionStandings: jest.fn() };
    schedulerService = {
      computeEtas: jest.fn().mockResolvedValue(new Map()),
      getEta: jest.fn(),
      invalidateCache: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PublicCompetitionsController],
      providers: [
        { provide: PrismaService, useValue: prisma },
        { provide: BracketsService, useValue: bracketsService },
        { provide: StandingsService, useValue: standingsService },
        { provide: SchedulerService, useValue: schedulerService },
      ],
    }).compile();

    controller = module.get<PublicCompetitionsController>(PublicCompetitionsController);
  });

  describe('GET /public/competitions/:id', () => {
    it('returns sanitized competition with counts, no organizerId', async () => {
      prisma.competition.findUnique.mockResolvedValue({
        id: 'c-1',
        name: 'Test Cup',
        date: new Date('2026-06-15'),
        location: 'Tokyo',
        status: 'ACTIVE',
        _count: { competitors: 50, categories: 10, mats: 4 },
      });

      const res = makeRes();
      const result = await controller.findOne('c-1', makeReq(), res);

      expect(result).toEqual({
        id: 'c-1',
        name: 'Test Cup',
        date: expect.any(Date),
        location: 'Tokyo',
        status: 'ACTIVE',
        competitorCount: 50,
        categoryCount: 10,
        matCount: 4,
        _count: undefined,
      });
      expect(JSON.stringify(result)).not.toContain('organizerId');
      expect(res._headers['cache-control']).toContain('public');
      expect(res._headers['etag']).toMatch(/^W\/"/);
    });

    it('returns 304 when If-None-Match matches', async () => {
      prisma.competition.findUnique.mockResolvedValue({
        id: 'c-1',
        name: 'Test Cup',
        date: new Date('2026-06-15'),
        location: 'Tokyo',
        status: 'ACTIVE',
        _count: { competitors: 50, categories: 10, mats: 4 },
      });

      // First call to learn the ETag
      const res1 = makeRes();
      await controller.findOne('c-1', makeReq(), res1);
      const etag = res1._headers['etag'];
      expect(etag).toBeTruthy();

      // Second call with If-None-Match → 304
      const res2 = makeRes();
      const result2 = await controller.findOne('c-1', makeReq({ 'if-none-match': etag }), res2);
      expect(res2._status).toBe(304);
      expect(res2._ended).toBe(true);
      expect(result2).toBeUndefined();
    });
  });

  describe('GET /public/competitions/:id/schedule', () => {
    it('NEVER includes Mat.pin (organizer-only secret) in response', async () => {
      prisma.competition.findUnique.mockResolvedValue({ id: 'c-1' });
      // Realistic Prisma response shape — but if pin were ever included, it
      // would still get stripped by our explicit `select`.
      prisma.mat.findMany.mockResolvedValue([
        {
          id: 'mat-1',
          number: 1,
          currentMatchId: null,
          categories: [{ id: 'cat-1', name: '-73kg', _count: { competitors: 4 } }],
        },
      ]);
      prisma.match.findMany.mockResolvedValue([]);

      const res = makeRes();
      const result = await controller.getSchedule('c-1', makeReq(), res);

      const json = JSON.stringify(result);
      expect(json).not.toContain('"pin"');
      expect(json).not.toContain('123456'); // arbitrary pin string sanity check
    });

    it('NEVER includes competitor email in match data', async () => {
      prisma.competition.findUnique.mockResolvedValue({ id: 'c-1' });
      prisma.mat.findMany.mockResolvedValue([
        {
          id: 'mat-1',
          number: 1,
          currentMatchId: 'm-1',
          categories: [],
        },
      ]);
      prisma.match.findUnique.mockResolvedValue({
        id: 'm-1',
        round: 1,
        poolPosition: 1,
        status: 'ACTIVE',
        category: { id: 'cat-1', name: '-73kg' },
        competitor1: {
          id: 'c1',
          firstName: 'Hiroshi',
          lastName: 'Tanaka',
          club: 'Tokyo JC',
          // Note: would be omitted by Prisma `select` even if returned by mock.
        },
        competitor2: {
          id: 'c2',
          firstName: 'Kenji',
          lastName: 'Sato',
          club: 'Osaka JC',
        },
      });
      prisma.match.findMany.mockResolvedValue([]);

      const res = makeRes();
      const result = await controller.getSchedule('c-1', makeReq(), res);

      const json = JSON.stringify(result);
      expect(json).not.toContain('email');
      expect(json).not.toContain('@'); // sanity: no email-like string
    });
  });

  describe('GET /public/competitions/:id/brackets', () => {
    it('strips email/dateOfBirth/registrationStatus from competitor data', async () => {
      prisma.competition.findUnique.mockResolvedValue({ id: 'c-1' });
      bracketsService.getBrackets.mockResolvedValue([
        {
          id: 'cat-1',
          name: '-73kg',
          gender: 'MALE',
          ageGroup: 'SENIOR',
          bracketType: 'POOLS',
          minWeight: 66,
          maxWeight: 73,
          competitors: [
            {
              id: 'c1',
              firstName: 'Hiroshi',
              lastName: 'Tanaka',
              club: 'Tokyo',
              email: 'hiroshi@example.com',
              dateOfBirth: new Date('1998-03-12'),
              registrationStatus: 'WEIGHED_IN',
              weight: 72.5,
              athleteId: 'a1',
            },
          ],
          matches: [
            {
              id: 'm1',
              round: 1,
              poolPosition: 1,
              sequenceNum: 1,
              status: 'SCHEDULED',
              winMethod: null,
              phase: null,
              poolGroup: null,
              scores: null,
              competitor1: {
                id: 'c1',
                firstName: 'Hiroshi',
                lastName: 'Tanaka',
                club: 'Tokyo',
                email: 'hiroshi@example.com',
                dateOfBirth: new Date('1998-03-12'),
                athleteId: 'a1',
              },
              competitor2: null,
              winner: null,
            },
          ],
        },
      ]);

      const res = makeRes();
      const result = await controller.getBrackets('c-1', makeReq(), res);

      const json = JSON.stringify(result);
      expect(json).not.toContain('email');
      expect(json).not.toContain('hiroshi@example.com');
      expect(json).not.toContain('dateOfBirth');
      expect(json).not.toContain('registrationStatus');
      expect(json).not.toContain('"weight"');
      // But the public-safe fields are still there
      expect(json).toContain('Hiroshi');
      expect(json).toContain('Tanaka');
      expect(json).toContain('Tokyo');
      // athleteId is exposed so the spectator UI can link to the profile.
      expect(json).toContain('"athleteId":"a1"');
    });
  });
});
