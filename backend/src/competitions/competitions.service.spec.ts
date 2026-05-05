import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { CompetitionsService } from './competitions.service';

describe('CompetitionsService', () => {
  let service: CompetitionsService;
  let prisma: {
    competition: {
      create: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      competition: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CompetitionsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<CompetitionsService>(CompetitionsService);
  });

  describe('create', () => {
    it('creates with organizerId', async () => {
      const data = { name: 'Open Mat', date: new Date('2026-07-01') };
      prisma.competition.create.mockResolvedValue({ id: 'comp-1', ...data, organizerId: 'org-1' });

      await service.create('org-1', data);

      expect(prisma.competition.create).toHaveBeenCalledWith({
        data: {
          name: 'Open Mat',
          date: data.date,
          location: '',
          organizerId: 'org-1',
        },
      });
    });
  });

  describe('findAll', () => {
    it('filters by organizerId', async () => {
      prisma.competition.findMany.mockResolvedValue([]);

      await service.findAll('org-1');

      expect(prisma.competition.findMany).toHaveBeenCalledWith({
        where: { organizerId: 'org-1' },
        orderBy: { date: 'desc' },
      });
    });
  });

  describe('findOne', () => {
    it('returns competition when organizer matches', async () => {
      const comp = { id: 'comp-1', organizerId: 'org-1', name: 'Open Mat' };
      prisma.competition.findUnique.mockResolvedValue(comp);

      const result = await service.findOne('comp-1', 'org-1');

      expect(result).toEqual(comp);
    });

    it('throws NotFoundException when not found', async () => {
      prisma.competition.findUnique.mockResolvedValue(null);

      await expect(service.findOne('comp-1', 'org-1')).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when organizerId does not match', async () => {
      prisma.competition.findUnique.mockResolvedValue({
        id: 'comp-1',
        organizerId: 'other-org',
      });

      await expect(service.findOne('comp-1', 'org-1')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('update', () => {
    it('updates after ownership check', async () => {
      prisma.competition.findUnique.mockResolvedValue({
        id: 'comp-1',
        organizerId: 'org-1',
      });
      prisma.competition.update.mockResolvedValue({ id: 'comp-1', name: 'Updated' });

      await service.update('comp-1', 'org-1', { name: 'Updated' });

      expect(prisma.competition.update).toHaveBeenCalledWith({
        where: { id: 'comp-1' },
        data: { name: 'Updated' },
      });
    });
  });

  describe('delete', () => {
    it('deletes after ownership check', async () => {
      prisma.competition.findUnique.mockResolvedValue({
        id: 'comp-1',
        organizerId: 'org-1',
      });
      prisma.competition.delete.mockResolvedValue({ id: 'comp-1' });

      await service.delete('comp-1', 'org-1');

      expect(prisma.competition.delete).toHaveBeenCalledWith({ where: { id: 'comp-1' } });
    });
  });
});
