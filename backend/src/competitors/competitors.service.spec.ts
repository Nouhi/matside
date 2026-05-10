import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Gender, RegistrationStatus } from '@prisma/client';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { AthletesService } from '../athletes/athletes.service';
import { CompetitorsService } from './competitors.service';

describe('CompetitorsService', () => {
  let service: CompetitorsService;
  let prisma: {
    competition: { findUnique: jest.Mock };
    competitor: {
      create: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    match: { findFirst: jest.Mock };
    $transaction: jest.Mock;
  };
  let athletesService: { findOrCreateForRegistration: jest.Mock };

  beforeEach(async () => {
    prisma = {
      competition: { findUnique: jest.fn() },
      competitor: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      match: { findFirst: jest.fn() },
      // The register() flow is wrapped in a transaction; we just call the
      // callback inline with the prisma mock so existing tests continue to
      // work without each test having to know about the wrapper.
      $transaction: jest.fn(async (cb) => cb(prisma)),
    } as typeof prisma & { match: { findFirst: jest.Mock } };

    athletesService = {
      findOrCreateForRegistration: jest.fn(async () => ({ id: 'athlete-1' })),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CompetitorsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AthletesService, useValue: athletesService },
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

    it('creates competitor when competition is REGISTRATION and returns IJF projection', async () => {
      prisma.competition.findUnique.mockResolvedValue({
        id: 'comp-1',
        status: 'REGISTRATION',
        date: new Date('2026-06-15'),
      });
      prisma.competitor.create.mockResolvedValue({
        id: 'competitor-1',
        ...registrationData,
        weight: 75,
      });

      const result = await service.register('comp-1', { ...registrationData, weight: 75 });

      expect(result.id).toBe('competitor-1');
      expect(result.projection).toEqual({
        age: 26,
        ageGroup: 'SENIOR',
        weightLabel: '-81kg',
        categoryName: 'SENIOR Men -81kg',
      });
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

    it('throws BadRequestException when email already registered', async () => {
      prisma.competition.findUnique.mockResolvedValue({
        id: 'comp-1',
        status: 'REGISTRATION',
      });
      prisma.competitor.findFirst.mockResolvedValue({ id: 'existing-1' });

      await expect(
        service.register('comp-1', { ...registrationData, email: 'dupe@test.com' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findAll', () => {
    it('returns competitors with IJF projection for each one', async () => {
      prisma.competition.findUnique.mockResolvedValue({ date: new Date('2026-06-15') });
      const competitors = [
        {
          id: 'c-1',
          dateOfBirth: new Date('2010-01-01'),
          gender: Gender.FEMALE,
          weight: 45,
        },
        {
          id: 'c-2',
          dateOfBirth: new Date('1995-05-05'),
          gender: Gender.MALE,
          weight: null,
        },
      ];
      prisma.competitor.findMany.mockResolvedValue(competitors);

      const result = await service.findAll('comp-1');

      expect(result).toHaveLength(2);
      expect(result[0].projection.ageGroup).toBe('CADET');
      expect(result[0].projection.weightLabel).toBe('-48kg');
      expect(result[1].projection.ageGroup).toBe('SENIOR');
      expect(result[1].projection.weightLabel).toBeNull();
      expect(prisma.competitor.findMany).toHaveBeenCalledWith({
        where: { competitionId: 'comp-1' },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('returns empty array when competition not found', async () => {
      prisma.competition.findUnique.mockResolvedValue(null);
      prisma.competitor.findMany.mockResolvedValue([]);

      const result = await service.findAll('missing');

      expect(result).toEqual([]);
    });
  });

  describe('updateStatus', () => {
    it('updates status when organizer owns competition', async () => {
      prisma.competitor.findUnique.mockResolvedValue({
        id: 'c-1',
        competition: { organizerId: 'org-1' },
      });
      prisma.competitor.update.mockResolvedValue({
        id: 'c-1',
        registrationStatus: RegistrationStatus.WEIGHED_IN,
      });

      const result = await service.updateStatus('c-1', 'org-1', RegistrationStatus.WEIGHED_IN);

      expect(result.registrationStatus).toBe(RegistrationStatus.WEIGHED_IN);
      expect(prisma.competitor.update).toHaveBeenCalledWith({
        where: { id: 'c-1' },
        data: { registrationStatus: RegistrationStatus.WEIGHED_IN },
      });
    });

    it('throws NotFoundException when competitor not found', async () => {
      prisma.competitor.findUnique.mockResolvedValue(null);

      await expect(
        service.updateStatus('c-1', 'org-1', RegistrationStatus.WEIGHED_IN),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when organizer does not own competition', async () => {
      prisma.competitor.findUnique.mockResolvedValue({
        id: 'c-1',
        competition: { organizerId: 'other-org' },
      });

      await expect(
        service.updateStatus('c-1', 'org-1', RegistrationStatus.WEIGHED_IN),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('recordWeight', () => {
    const baseCompetitor = {
      id: 'c-1',
      firstName: 'Hatami',
      lastName: 'M',
      email: '',
      dateOfBirth: new Date('1995-01-01'),
      gender: Gender.MALE,
      weight: 72,
      categoryId: null as string | null,
      category: null as { id: string; name: string } | null,
      competition: {
        id: 'comp-1',
        organizerId: 'org-1',
        status: 'WEIGH_IN' as const,
        date: new Date('2026-06-15'),
      },
    };

    it('records weight, sets WEIGHED_IN, nulls categoryId, returns bumped projection', async () => {
      // Pre-existing weight 72 → -73kg. New weight 75 → -81kg. Should be bumped.
      prisma.competitor.findUnique.mockResolvedValue(baseCompetitor);
      prisma.competitor.update.mockResolvedValue({
        ...baseCompetitor,
        weight: 75,
        categoryId: null,
        registrationStatus: RegistrationStatus.WEIGHED_IN,
      });

      const result = await service.recordWeight('c-1', 'org-1', 75);

      expect(prisma.competitor.update).toHaveBeenCalledWith({
        where: { id: 'c-1' },
        data: {
          weight: 75,
          categoryId: null,
          registrationStatus: RegistrationStatus.WEIGHED_IN,
        },
      });
      expect(result.bumped).toBe(true);
      expect(result.previousProjection.weightLabel).toBe('-73kg');
      expect(result.projection.weightLabel).toBe('-81kg');
    });

    it('does not flag bump when new weight stays in same IJF class', async () => {
      prisma.competitor.findUnique.mockResolvedValue(baseCompetitor);
      prisma.competitor.update.mockResolvedValue({
        ...baseCompetitor,
        weight: 72.5,
      });

      const result = await service.recordWeight('c-1', 'org-1', 72.5);

      expect(result.bumped).toBe(false);
      expect(result.previousProjection.weightLabel).toBe('-73kg');
      expect(result.projection.weightLabel).toBe('-73kg');
    });

    it('REFUSES when competition is ACTIVE', async () => {
      prisma.competitor.findUnique.mockResolvedValue({
        ...baseCompetitor,
        competition: { ...baseCompetitor.competition, status: 'ACTIVE' as const },
      });

      await expect(service.recordWeight('c-1', 'org-1', 75)).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.competitor.update).not.toHaveBeenCalled();
    });

    it('REFUSES when competitor’s category has a non-SCHEDULED match (silent corruption guard)', async () => {
      prisma.competitor.findUnique.mockResolvedValue({
        ...baseCompetitor,
        categoryId: 'cat-1',
        category: { id: 'cat-1', name: '-73kg' },
      });
      prisma.match.findFirst.mockResolvedValue({ id: 'm-active' });

      await expect(service.recordWeight('c-1', 'org-1', 75)).rejects.toThrow(
        /matches have started/i,
      );
      expect(prisma.competitor.update).not.toHaveBeenCalled();
    });

    it('passes when competitor’s category has only SCHEDULED matches', async () => {
      prisma.competitor.findUnique.mockResolvedValue({
        ...baseCompetitor,
        categoryId: 'cat-1',
        category: { id: 'cat-1', name: '-73kg' },
      });
      prisma.match.findFirst.mockResolvedValue(null);
      prisma.competitor.update.mockResolvedValue({
        ...baseCompetitor,
        weight: 75,
        categoryId: null,
      });

      await expect(service.recordWeight('c-1', 'org-1', 75)).resolves.toBeDefined();
      expect(prisma.competitor.update).toHaveBeenCalled();
    });

    it('rejects with ForbiddenException for the wrong organizer', async () => {
      prisma.competitor.findUnique.mockResolvedValue({
        ...baseCompetitor,
        competition: { ...baseCompetitor.competition, organizerId: 'other-org' },
      });

      await expect(service.recordWeight('c-1', 'org-1', 75)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('disqualify', () => {
    it('marks WITHDRAWN without nulling categoryId (preserves bracket position)', async () => {
      prisma.competitor.findUnique.mockResolvedValue({
        id: 'c-1',
        categoryId: 'cat-1',
        competition: { organizerId: 'org-1' },
      });
      prisma.competitor.update.mockResolvedValue({
        id: 'c-1',
        registrationStatus: RegistrationStatus.WITHDRAWN,
      });

      await service.disqualify('c-1', 'org-1');

      expect(prisma.competitor.update).toHaveBeenCalledWith({
        where: { id: 'c-1' },
        data: { registrationStatus: RegistrationStatus.WITHDRAWN },
      });
      // Importantly: NOT { categoryId: null } — leaves competitor in their
      // bracket so existing matches resolve as walkovers.
    });

    it('rejects with ForbiddenException for the wrong organizer', async () => {
      prisma.competitor.findUnique.mockResolvedValue({
        id: 'c-1',
        competition: { organizerId: 'other-org' },
      });

      await expect(service.disqualify('c-1', 'org-1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('rejects with NotFoundException when missing', async () => {
      prisma.competitor.findUnique.mockResolvedValue(null);

      await expect(service.disqualify('missing', 'org-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
