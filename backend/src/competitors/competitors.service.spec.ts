import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Gender, RegistrationStatus } from '@prisma/client';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { CompetitorsService } from './competitors.service';

describe('CompetitorsService', () => {
  let service: CompetitorsService;
  let prisma: {
    competition: { findUnique: jest.Mock };
    competitor: { create: jest.Mock; findMany: jest.Mock; findUnique: jest.Mock; update: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      competition: { findUnique: jest.fn() },
      competitor: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CompetitorsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<CompetitorsService>(CompetitorsService);
  });

  describe('register', () => {
    const registrationData = {
      firstName: 'Taro',
      lastName: 'Yamada',
      dateOfBirth: new Date('2000-01-01'),
      gender: Gender.MALE,
    };

    it('creates competitor when competition is REGISTRATION', async () => {
      prisma.competition.findUnique.mockResolvedValue({
        id: 'comp-1',
        status: 'REGISTRATION',
      });
      prisma.competitor.create.mockResolvedValue({ id: 'competitor-1', ...registrationData });

      const result = await service.register('comp-1', registrationData);

      expect(result).toEqual({ id: 'competitor-1', ...registrationData });
      expect(prisma.competitor.create).toHaveBeenCalled();
    });

    it('throws BadRequestException when competition is DRAFT', async () => {
      prisma.competition.findUnique.mockResolvedValue({
        id: 'comp-1',
        status: 'DRAFT',
      });

      await expect(service.register('comp-1', registrationData)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws NotFoundException when competition does not exist', async () => {
      prisma.competition.findUnique.mockResolvedValue(null);

      await expect(service.register('comp-1', registrationData)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findAll', () => {
    it('returns competitors for competition', async () => {
      const competitors = [{ id: 'c-1' }, { id: 'c-2' }];
      prisma.competitor.findMany.mockResolvedValue(competitors);

      const result = await service.findAll('comp-1');

      expect(result).toEqual(competitors);
      expect(prisma.competitor.findMany).toHaveBeenCalledWith({
        where: { competitionId: 'comp-1' },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('updateStatus', () => {
    it('updates status', async () => {
      prisma.competitor.findUnique.mockResolvedValue({ id: 'c-1' });
      prisma.competitor.update.mockResolvedValue({
        id: 'c-1',
        registrationStatus: RegistrationStatus.CONFIRMED,
      });

      const result = await service.updateStatus('c-1', RegistrationStatus.CONFIRMED);

      expect(result.registrationStatus).toBe(RegistrationStatus.CONFIRMED);
      expect(prisma.competitor.update).toHaveBeenCalledWith({
        where: { id: 'c-1' },
        data: { registrationStatus: RegistrationStatus.CONFIRMED },
      });
    });

    it('throws NotFoundException when competitor not found', async () => {
      prisma.competitor.findUnique.mockResolvedValue(null);

      await expect(
        service.updateStatus('c-1', RegistrationStatus.CONFIRMED),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
