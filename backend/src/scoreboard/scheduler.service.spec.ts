import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { SchedulerService } from './scheduler.service';

describe('SchedulerService.computeEtas', () => {
  let service: SchedulerService;
  let prisma: {
    competition: { findUnique: jest.Mock };
    mat: { findMany: jest.Mock };
    match: { findMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      competition: { findUnique: jest.fn() },
      mat: { findMany: jest.fn() },
      match: { findMany: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SchedulerService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<SchedulerService>(SchedulerService);
  });

  function competition(matchDuration = 240) {
    return { matchDuration };
  }

  it('returns empty map when competition is missing', async () => {
    prisma.competition.findUnique.mockResolvedValue(null);
    const etas = await service.computeEtas('missing');
    expect(etas.size).toBe(0);
  });

  it('ACTIVE match gets eta=0; subsequent SCHEDULED matches step by matchDuration', async () => {
    prisma.competition.findUnique.mockResolvedValue(competition(240));
    prisma.mat.findMany.mockResolvedValue([{ id: 'mat-1' }]);
    prisma.match.findMany.mockResolvedValue([
      { id: 'm-active', status: 'ACTIVE' },
      { id: 'm-next', status: 'SCHEDULED' },
      { id: 'm-after', status: 'SCHEDULED' },
    ]);

    const etas = await service.computeEtas('comp-1');

    expect(etas.get('m-active')).toBe(0);
    expect(etas.get('m-next')).toBe(240);
    expect(etas.get('m-after')).toBe(480);
  });

  it('first SCHEDULED match starts at eta=0 when nothing ACTIVE', async () => {
    prisma.competition.findUnique.mockResolvedValue(competition(240));
    prisma.mat.findMany.mockResolvedValue([{ id: 'mat-1' }]);
    prisma.match.findMany.mockResolvedValue([
      { id: 'm-1', status: 'SCHEDULED' },
      { id: 'm-2', status: 'SCHEDULED' },
    ]);

    const etas = await service.computeEtas('comp-1');

    expect(etas.get('m-1')).toBe(0);
    expect(etas.get('m-2')).toBe(240);
  });

  it('mats are independent — each starts its own queue from 0', async () => {
    prisma.competition.findUnique.mockResolvedValue(competition(180));
    prisma.mat.findMany.mockResolvedValue([{ id: 'mat-1' }, { id: 'mat-2' }]);
    prisma.match.findMany
      .mockResolvedValueOnce([
        { id: 'm-1a', status: 'ACTIVE' },
        { id: 'm-1b', status: 'SCHEDULED' },
      ])
      .mockResolvedValueOnce([
        { id: 'm-2a', status: 'ACTIVE' },
        { id: 'm-2b', status: 'SCHEDULED' },
      ]);

    const etas = await service.computeEtas('comp-1');

    expect(etas.get('m-1a')).toBe(0);
    expect(etas.get('m-1b')).toBe(180);
    expect(etas.get('m-2a')).toBe(0);
    expect(etas.get('m-2b')).toBe(180);
  });

  it('uses competition.matchDuration as the per-step tick', async () => {
    prisma.competition.findUnique.mockResolvedValue(competition(300)); // 5 min
    prisma.mat.findMany.mockResolvedValue([{ id: 'mat-1' }]);
    prisma.match.findMany.mockResolvedValue([
      { id: 'm-1', status: 'SCHEDULED' },
      { id: 'm-2', status: 'SCHEDULED' },
      { id: 'm-3', status: 'SCHEDULED' },
    ]);

    const etas = await service.computeEtas('comp-1');

    expect(etas.get('m-1')).toBe(0);
    expect(etas.get('m-2')).toBe(300);
    expect(etas.get('m-3')).toBe(600);
  });

  it('caches results within TTL — second call within 5s does NOT re-query', async () => {
    prisma.competition.findUnique.mockResolvedValue(competition(240));
    prisma.mat.findMany.mockResolvedValue([{ id: 'mat-1' }]);
    prisma.match.findMany.mockResolvedValue([{ id: 'm-1', status: 'SCHEDULED' }]);

    await service.computeEtas('comp-1');
    await service.computeEtas('comp-1');

    expect(prisma.competition.findUnique).toHaveBeenCalledTimes(1);
  });

  it('invalidateCache(id) drops the cached result for that competition only', async () => {
    prisma.competition.findUnique.mockResolvedValue(competition(240));
    prisma.mat.findMany.mockResolvedValue([{ id: 'mat-1' }]);
    prisma.match.findMany.mockResolvedValue([{ id: 'm-1', status: 'SCHEDULED' }]);

    await service.computeEtas('comp-1');
    service.invalidateCache('comp-1');
    await service.computeEtas('comp-1');

    expect(prisma.competition.findUnique).toHaveBeenCalledTimes(2);
  });

  it('getEta returns null when match is not in queue', async () => {
    prisma.competition.findUnique.mockResolvedValue(competition(240));
    prisma.mat.findMany.mockResolvedValue([]);
    prisma.match.findMany.mockResolvedValue([]);

    const eta = await service.getEta('comp-1', 'unknown-match');
    expect(eta).toBeNull();
  });
});
