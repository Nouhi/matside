import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StandingsService } from './standings.service';

describe('StandingsService', () => {
  let service: StandingsService;
  let prisma: {
    competition: { findUnique: jest.Mock };
    category: { findMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      competition: { findUnique: jest.fn() },
      category: { findMany: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StandingsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<StandingsService>(StandingsService);
  });

  function competitor(id: string, lastName = 'X', firstName = 'X', club = '') {
    return { id, firstName, lastName, club, registrationStatus: 'WEIGHED_IN' };
  }

  function match(c1: string, c2: string, winner: string | null, winMethod: string | null = winner ? 'IPPON' : null, status = winner ? 'COMPLETED' : 'SCHEDULED', round = 1, position = 1) {
    return {
      competitor1Id: c1,
      competitor2Id: c2,
      winnerId: winner,
      winMethod,
      status,
      round,
      poolPosition: position,
      scores: null,
    };
  }

  it('throws if competition not found', async () => {
    prisma.competition.findUnique.mockResolvedValue(null);
    await expect(service.getCompetitionStandings('x')).rejects.toThrow(NotFoundException);
  });

  it('returns ROUND_ROBIN COMPLETE when all matches done and no ties', async () => {
    prisma.competition.findUnique.mockResolvedValue({ id: 'comp-1' });
    prisma.category.findMany.mockResolvedValue([
      {
        id: 'cat-1',
        name: '-66kg',
        bracketType: 'ROUND_ROBIN',
        competitors: [competitor('a'), competitor('b'), competitor('c')],
        matches: [
          match('a', 'b', 'a'),
          match('a', 'c', 'a'),
          match('b', 'c', 'b'),
        ],
      },
    ]);

    const result = await service.getCompetitionStandings('comp-1');
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('COMPLETE');
    expect(result[0].standings.map((s) => s.competitor.id)).toEqual(['a', 'b', 'c']);
  });

  it('returns ROUND_ROBIN PENDING_PLAYOFF when complete but unbreakable tie', async () => {
    prisma.competition.findUnique.mockResolvedValue({ id: 'comp-1' });
    prisma.category.findMany.mockResolvedValue([
      {
        id: 'cat-1',
        name: '-66kg',
        bracketType: 'ROUND_ROBIN',
        competitors: [competitor('a'), competitor('b'), competitor('c')],
        matches: [
          match('a', 'b', 'a', 'DECISION'),
          match('b', 'c', 'b', 'DECISION'),
          match('c', 'a', 'c', 'DECISION'),
        ],
      },
    ]);

    const result = await service.getCompetitionStandings('comp-1');
    expect(result[0].status).toBe('PENDING_PLAYOFF');
  });

  it('returns ROUND_ROBIN IN_PROGRESS when matches still pending', async () => {
    prisma.competition.findUnique.mockResolvedValue({ id: 'comp-1' });
    prisma.category.findMany.mockResolvedValue([
      {
        id: 'cat-1',
        name: '-66kg',
        bracketType: 'ROUND_ROBIN',
        competitors: [competitor('a'), competitor('b')],
        matches: [match('a', 'b', null)],
      },
    ]);

    const result = await service.getCompetitionStandings('comp-1');
    expect(result[0].status).toBe('IN_PROGRESS');
  });

  it('returns SINGLE_REPECHAGE COMPLETE with gold/silver/bronze when final played', async () => {
    prisma.competition.findUnique.mockResolvedValue({ id: 'comp-1' });
    prisma.category.findMany.mockResolvedValue([
      {
        id: 'cat-1',
        name: '-73kg',
        bracketType: 'SINGLE_REPECHAGE',
        competitors: [competitor('a'), competitor('b'), competitor('c'), competitor('d')],
        matches: [
          match('a', 'b', 'a', 'IPPON', 'COMPLETED', 1, 1),
          match('c', 'd', 'c', 'IPPON', 'COMPLETED', 1, 2),
          match('a', 'c', 'a', 'IPPON', 'COMPLETED', 2, 1),
        ],
      },
    ]);

    const result = await service.getCompetitionStandings('comp-1');
    expect(result[0].status).toBe('COMPLETE');
    const ranks = result[0].standings.map((s) => ({ rank: s.rank, id: s.competitor.id }));
    expect(ranks.find((r) => r.rank === 1)?.id).toBe('a');
    expect(ranks.find((r) => r.rank === 2)?.id).toBe('c');
    expect(ranks.filter((r) => r.rank === 3).map((r) => r.id).sort()).toEqual(['b', 'd']);
  });

  it('excludes WITHDRAWN competitors from standings', async () => {
    prisma.competition.findUnique.mockResolvedValue({ id: 'comp-1' });
    prisma.category.findMany.mockResolvedValue([
      {
        id: 'cat-1',
        name: '-66kg',
        bracketType: 'ROUND_ROBIN',
        competitors: [competitor('a'), competitor('b')],  // c is filtered out by Prisma `where`
        matches: [match('a', 'b', 'a')],
      },
    ]);

    const result = await service.getCompetitionStandings('comp-1');
    expect(result[0].standings.map((s) => s.competitor.id)).toEqual(['a', 'b']);

    // Verify the Prisma query filters WITHDRAWN
    expect(prisma.category.findMany).toHaveBeenCalledWith(expect.objectContaining({
      include: expect.objectContaining({
        competitors: { where: { registrationStatus: { not: 'WITHDRAWN' } } },
      }),
    }));
  });
});
