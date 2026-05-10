import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { CategoriesService } from './categories.service';

// Focused regression coverage for the silent-corruption guard. The full
// happy-path generateCategories flow is exercised end-to-end by the seed
// + e2e flows; this file proves the guard fires.
describe('CategoriesService.generateCategories — bracket-corruption guard', () => {
  let service: CategoriesService;
  let prisma: {
    competition: { findUnique: jest.Mock };
    competitor: { updateMany: jest.Mock; findMany: jest.Mock };
    category: { deleteMany: jest.Mock; create: jest.Mock };
    match: { findFirst: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      competition: { findUnique: jest.fn() },
      competitor: {
        updateMany: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      category: { deleteMany: jest.fn(), create: jest.fn() },
      match: { findFirst: jest.fn() },
      $transaction: jest.fn(async (cb) => cb(prisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoriesService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get<CategoriesService>(CategoriesService);
  });

  function withWeighIn() {
    prisma.competition.findUnique.mockResolvedValue({
      id: 'comp-1',
      organizerId: 'org-1',
      status: 'WEIGH_IN',
      date: new Date('2026-06-15'),
    });
  }

  it('REFUSES when ANY category has a non-SCHEDULED match', async () => {
    withWeighIn();
    prisma.match.findFirst.mockResolvedValue({ id: 'm-active' });

    await expect(
      service.generateCategories('comp-1', 'org-1'),
    ).rejects.toThrow(/at least one match has already started/i);

    // Critical: deleteMany NEVER ran. No partial wipe.
    expect(prisma.category.deleteMany).not.toHaveBeenCalled();
    expect(prisma.competitor.updateMany).not.toHaveBeenCalled();
  });

  it('proceeds when no non-SCHEDULED match exists yet', async () => {
    withWeighIn();
    prisma.match.findFirst.mockResolvedValue(null);

    await service.generateCategories('comp-1', 'org-1');

    expect(prisma.category.deleteMany).toHaveBeenCalled();
  });
});
