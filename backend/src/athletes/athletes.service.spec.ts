import { Test, TestingModule } from '@nestjs/testing';
import { Gender } from '@prisma/client';
import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AthletesService } from './athletes.service';

describe('AthletesService', () => {
  let service: AthletesService;
  let prisma: {
    athlete: { findUnique: jest.Mock; create: jest.Mock };
    competitor: { findMany: jest.Mock; update: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      athlete: { findUnique: jest.fn(), create: jest.fn() },
      competitor: { findMany: jest.fn(), update: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AthletesService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<AthletesService>(AthletesService);
  });

  describe('findOrCreateForRegistration', () => {
    const baseInput = {
      firstName: 'Hiroshi',
      lastName: 'Tanaka',
      dateOfBirth: new Date('1998-03-12'),
      gender: Gender.MALE,
    };

    it('returns existing athlete when matched by email', async () => {
      prisma.athlete.findUnique.mockResolvedValue({
        id: 'a1',
        ...baseInput,
        email: 'hiroshi@example.com',
      });

      const result = await service.findOrCreateForRegistration({
        ...baseInput,
        email: 'hiroshi@example.com',
      });

      expect(result.id).toBe('a1');
      expect(prisma.athlete.findUnique).toHaveBeenCalledWith({
        where: { email: 'hiroshi@example.com' },
      });
      expect(prisma.athlete.create).not.toHaveBeenCalled();
    });

    it('creates a new athlete when email is not found', async () => {
      prisma.athlete.findUnique.mockResolvedValue(null);
      prisma.athlete.create.mockResolvedValue({ id: 'a-new' });

      await service.findOrCreateForRegistration({
        ...baseInput,
        email: 'newbie@example.com',
      });

      expect(prisma.athlete.create).toHaveBeenCalledWith({
        data: {
          firstName: 'Hiroshi',
          lastName: 'Tanaka',
          dateOfBirth: baseInput.dateOfBirth,
          gender: Gender.MALE,
          email: 'newbie@example.com',
        },
      });
    });

    it('skips findUnique entirely when email is empty (avoids "" collision bug)', async () => {
      prisma.athlete.create.mockResolvedValue({ id: 'a-new' });

      await service.findOrCreateForRegistration({ ...baseInput, email: '' });

      expect(prisma.athlete.findUnique).not.toHaveBeenCalled();
      expect(prisma.athlete.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ email: null }),
      });
    });

    it('treats whitespace-only email as no email', async () => {
      prisma.athlete.create.mockResolvedValue({ id: 'a-new' });

      await service.findOrCreateForRegistration({ ...baseInput, email: '   ' });

      expect(prisma.athlete.findUnique).not.toHaveBeenCalled();
      expect(prisma.athlete.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ email: null }),
      });
    });

    it('trims whitespace around email before lookup', async () => {
      prisma.athlete.findUnique.mockResolvedValue({ id: 'a1' });

      await service.findOrCreateForRegistration({
        ...baseInput,
        email: '  hiroshi@example.com  ',
      });

      expect(prisma.athlete.findUnique).toHaveBeenCalledWith({
        where: { email: 'hiroshi@example.com' },
      });
    });
  });

  describe('getProfile', () => {
    it('returns NotFoundException when athlete missing', async () => {
      prisma.athlete.findUnique = jest.fn().mockResolvedValue(null);

      await expect(service.getProfile('missing')).rejects.toThrow(NotFoundException);
    });

    it('returns sanitized profile WITHOUT email or full DOB and aggregates lifetime stats', async () => {
      prisma.athlete.findUnique = jest.fn().mockResolvedValue({
        id: 'a1',
        firstName: 'Hiroshi',
        lastName: 'Tanaka',
        gender: Gender.MALE,
        dateOfBirth: new Date('1998-03-12'),
        email: 'hiroshi@example.com',
        competitors: [
          {
            id: 'c1',
            club: 'Tokyo',
            belt: 'BLACK_2DAN',
            weight: 72.5,
            registrationStatus: 'WEIGHED_IN',
            competition: {
              id: 'comp1',
              name: '2026 Worlds',
              date: new Date('2026-06-15'),
              location: 'Tokyo',
              status: 'COMPLETED',
            },
            category: { id: 'cat1', name: '-73kg' },
            matchesAsCompetitor1: [
              { id: 'm1', status: 'COMPLETED', winnerId: 'c1', winMethod: 'IPPON' },
              { id: 'm2', status: 'COMPLETED', winnerId: 'c1', winMethod: 'WAZA_ARI' },
            ],
            matchesAsCompetitor2: [
              { id: 'm3', status: 'COMPLETED', winnerId: 'other', winMethod: 'IPPON' },
            ],
          },
        ],
      });

      const profile = await service.getProfile('a1');

      // No PII leak.
      const json = JSON.stringify(profile);
      expect(json).not.toContain('hiroshi@example.com');
      expect(json).not.toContain('email');
      expect(json).not.toContain('dateOfBirth');

      // Lifetime stats aggregated correctly.
      expect(profile.lifetime).toEqual({
        competitionsEntered: 1,
        matchesPlayed: 3,
        wins: 2,
        losses: 1,
        ippons: 1, // only the win-by-IPPON counts
      });

      // Per-competition entry.
      expect(profile.competitions[0].matches).toEqual({ played: 3, won: 2, lost: 1 });
      expect(profile.competitions[0].weight).toBe(72.5);
    });
  });
});
