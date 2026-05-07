import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ScoreboardService } from './scoreboard.service';

describe('ScoreboardService', () => {
  let service: ScoreboardService;
  let prisma: {
    match: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
    };
    category: {
      findUnique: jest.Mock;
    };
    mat: {
      findUnique: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      match: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      category: {
        findUnique: jest.fn(),
      },
      mat: {
        findUnique: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScoreboardService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<ScoreboardService>(ScoreboardService);
  });

  function activeMatch(overrides: Record<string, unknown> = {}) {
    return {
      id: 'match-1',
      categoryId: 'cat-1',
      competitor1Id: 'c1',
      competitor2Id: 'c2',
      status: 'ACTIVE',
      round: 1,
      poolPosition: 1,
      scores: null,
      ...overrides,
    };
  }

  describe('applyScoreEvent', () => {
    it('throws if match not found', async () => {
      prisma.match.findUnique.mockResolvedValue(null);
      await expect(
        service.applyScoreEvent('x', { type: 'WAZA_ARI', competitorId: 'c1', timestamp: 0 }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws if match is not active', async () => {
      prisma.match.findUnique.mockResolvedValue(activeMatch({ status: 'SCHEDULED' }));
      await expect(
        service.applyScoreEvent('x', { type: 'WAZA_ARI', competitorId: 'c1', timestamp: 0 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws if competitor is not in match', async () => {
      prisma.match.findUnique.mockResolvedValue(activeMatch());
      await expect(
        service.applyScoreEvent('x', { type: 'WAZA_ARI', competitorId: 'unknown', timestamp: 0 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('increments WAZA_ARI without terminating', async () => {
      prisma.match.findUnique.mockResolvedValue(activeMatch());
      prisma.match.update.mockImplementation(({ data }) => Promise.resolve({ id: 'match-1', ...data }));

      const result = await service.applyScoreEvent('match-1', {
        type: 'WAZA_ARI', competitorId: 'c1', timestamp: 0,
      });

      expect(result.terminated).toBe(false);
      const call = prisma.match.update.mock.calls[0][0];
      expect(call.data.scores.competitor1.wazaAri).toBe(1);
      expect(call.data.status).toBeUndefined();
    });

    it('terminates as IPPON when 2nd WAZA_ARI accumulates', async () => {
      prisma.match.findUnique.mockResolvedValue(
        activeMatch({ scores: { competitor1: { wazaAri: 1, yuko: 0, shido: 0 }, competitor2: { wazaAri: 0, yuko: 0, shido: 0 } } }),
      );
      prisma.category.findUnique.mockResolvedValue({ id: 'cat-1', bracketType: 'ROUND_ROBIN' });
      prisma.match.update.mockImplementation(({ data }) => Promise.resolve({ id: 'match-1', categoryId: 'cat-1', round: 1, poolPosition: 1, ...data }));

      const result = await service.applyScoreEvent('match-1', {
        type: 'WAZA_ARI', competitorId: 'c1', timestamp: 0,
      });

      expect(result.terminated).toBe(true);
      expect(result.winMethod).toBe('IPPON');
      expect(result.winnerId).toBe('c1');
    });

    it('increments YUKO without terminating regardless of count', async () => {
      prisma.match.findUnique.mockResolvedValue(
        activeMatch({ scores: { competitor1: { wazaAri: 0, yuko: 5, shido: 0 }, competitor2: { wazaAri: 0, yuko: 0, shido: 0 } } }),
      );
      prisma.match.update.mockImplementation(({ data }) => Promise.resolve({ id: 'match-1', ...data }));

      const result = await service.applyScoreEvent('match-1', {
        type: 'YUKO', competitorId: 'c1', timestamp: 0,
      });

      expect(result.terminated).toBe(false);
      const call = prisma.match.update.mock.calls[0][0];
      expect(call.data.scores.competitor1.yuko).toBe(6);
    });

    it('increments SHIDO without terminating before 3rd', async () => {
      prisma.match.findUnique.mockResolvedValue(
        activeMatch({ scores: { competitor1: { wazaAri: 0, yuko: 0, shido: 1 }, competitor2: { wazaAri: 0, yuko: 0, shido: 0 } } }),
      );
      prisma.match.update.mockImplementation(({ data }) => Promise.resolve({ id: 'match-1', ...data }));

      const result = await service.applyScoreEvent('match-1', {
        type: 'SHIDO', competitorId: 'c1', timestamp: 0,
      });

      expect(result.terminated).toBe(false);
    });

    it('terminates as HANSOKU_MAKE on 3rd SHIDO; opponent wins', async () => {
      prisma.match.findUnique.mockResolvedValue(
        activeMatch({ scores: { competitor1: { wazaAri: 0, yuko: 0, shido: 2 }, competitor2: { wazaAri: 0, yuko: 0, shido: 0 } } }),
      );
      prisma.category.findUnique.mockResolvedValue({ id: 'cat-1', bracketType: 'ROUND_ROBIN' });
      prisma.match.update.mockImplementation(({ data }) => Promise.resolve({ id: 'match-1', categoryId: 'cat-1', round: 1, poolPosition: 1, ...data }));

      const result = await service.applyScoreEvent('match-1', {
        type: 'SHIDO', competitorId: 'c1', timestamp: 0,
      });

      expect(result.terminated).toBe(true);
      expect(result.winMethod).toBe('HANSOKU_MAKE');
      expect(result.winnerId).toBe('c2');
    });

    it('IPPON event terminates immediately for that competitor', async () => {
      prisma.match.findUnique.mockResolvedValue(activeMatch());
      prisma.category.findUnique.mockResolvedValue({ id: 'cat-1', bracketType: 'ROUND_ROBIN' });
      prisma.match.update.mockImplementation(({ data }) => Promise.resolve({ id: 'match-1', categoryId: 'cat-1', round: 1, poolPosition: 1, ...data }));

      const result = await service.applyScoreEvent('match-1', {
        type: 'IPPON', competitorId: 'c2', timestamp: 0,
      });

      expect(result.terminated).toBe(true);
      expect(result.winMethod).toBe('IPPON');
      expect(result.winnerId).toBe('c2');
    });

    it('normalizeScores backfills missing yuko field for legacy match data', async () => {
      // legacy data shape: no yuko key
      prisma.match.findUnique.mockResolvedValue(
        activeMatch({ scores: { competitor1: { wazaAri: 1, shido: 0 }, competitor2: { wazaAri: 0, shido: 1 } } }),
      );
      prisma.match.update.mockImplementation(({ data }) => Promise.resolve({ id: 'match-1', ...data }));

      await service.applyScoreEvent('match-1', { type: 'YUKO', competitorId: 'c1', timestamp: 0 });

      const call = prisma.match.update.mock.calls[0][0];
      expect(call.data.scores.competitor1.yuko).toBe(1);
      expect(call.data.scores.competitor2.yuko).toBe(0);
      expect(call.data.scores.competitor1.wazaAri).toBe(1);
      expect(call.data.scores.competitor2.shido).toBe(1);
    });
  });

  describe('startMatch', () => {
    it('throws if match not found', async () => {
      prisma.match.findUnique.mockResolvedValue(null);
      await expect(service.startMatch('x')).rejects.toThrow(NotFoundException);
    });

    it('throws if match is not SCHEDULED', async () => {
      prisma.match.findUnique.mockResolvedValue(activeMatch({ status: 'ACTIVE' }));
      await expect(service.startMatch('x')).rejects.toThrow(BadRequestException);
    });

    it('initializes scores with all-zero CompetitorScore including yuko', async () => {
      prisma.match.findUnique.mockResolvedValue({ id: 'match-1', status: 'SCHEDULED' });
      prisma.match.update.mockImplementation(({ data }) => Promise.resolve({ id: 'match-1', ...data }));

      await service.startMatch('match-1');

      const call = prisma.match.update.mock.calls[0][0];
      expect(call.data.status).toBe('ACTIVE');
      expect(call.data.scores).toEqual({
        competitor1: { wazaAri: 0, yuko: 0, shido: 0 },
        competitor2: { wazaAri: 0, yuko: 0, shido: 0 },
      });
    });
  });

  describe('endMatch + advanceWinner', () => {
    it('endMatch on round-robin category does not advance', async () => {
      prisma.match.findUnique.mockResolvedValue(activeMatch());
      prisma.match.update.mockResolvedValue({ id: 'match-1', categoryId: 'cat-1', round: 1, poolPosition: 1, status: 'COMPLETED' });
      prisma.category.findUnique.mockResolvedValue({ id: 'cat-1', bracketType: 'ROUND_ROBIN' });

      await service.endMatch('match-1', 'c1', 'DECISION');

      expect(prisma.match.findFirst).not.toHaveBeenCalled();
    });

    it('endMatch on elimination category advances winner to next-round slot at competitor1 (odd position)', async () => {
      prisma.match.findUnique.mockResolvedValue(activeMatch());
      prisma.match.update.mockResolvedValueOnce({ id: 'match-1', categoryId: 'cat-1', round: 1, poolPosition: 1, status: 'COMPLETED' });
      prisma.category.findUnique.mockResolvedValue({ id: 'cat-1', bracketType: 'SINGLE_REPECHAGE' });
      prisma.match.findFirst.mockResolvedValue({ id: 'match-r2-1' });

      await service.endMatch('match-1', 'c1', 'DECISION');

      expect(prisma.match.findFirst).toHaveBeenCalledWith({
        where: { categoryId: 'cat-1', round: 2, poolPosition: 1 },
      });
      const advanceCall = prisma.match.update.mock.calls[1][0];
      expect(advanceCall.where.id).toBe('match-r2-1');
      expect(advanceCall.data.competitor1.connect.id).toBe('c1');
    });

    it('endMatch on elimination advances winner to competitor2 slot for even position', async () => {
      prisma.match.findUnique.mockResolvedValue(activeMatch({ poolPosition: 2 }));
      prisma.match.update.mockResolvedValueOnce({ id: 'match-1', categoryId: 'cat-1', round: 1, poolPosition: 2, status: 'COMPLETED' });
      prisma.category.findUnique.mockResolvedValue({ id: 'cat-1', bracketType: 'SINGLE_REPECHAGE' });
      prisma.match.findFirst.mockResolvedValue({ id: 'match-r2-1' });

      await service.endMatch('match-1', 'c1', 'DECISION');

      const advanceCall = prisma.match.update.mock.calls[1][0];
      expect(advanceCall.data.competitor2.connect.id).toBe('c1');
    });

    it('advanceWinner is a no-op if no next-round slot exists (final round)', async () => {
      prisma.match.findUnique.mockResolvedValue(activeMatch({ round: 2 }));
      prisma.match.update.mockResolvedValueOnce({ id: 'match-1', categoryId: 'cat-1', round: 2, poolPosition: 1, status: 'COMPLETED' });
      prisma.category.findUnique.mockResolvedValue({ id: 'cat-1', bracketType: 'SINGLE_REPECHAGE' });
      prisma.match.findFirst.mockResolvedValue(null);

      await service.endMatch('match-1', 'c1', 'DECISION');

      expect(prisma.match.update).toHaveBeenCalledTimes(1);
    });
  });
});
