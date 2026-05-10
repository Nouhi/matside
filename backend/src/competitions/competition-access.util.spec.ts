import { ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  requireCategoryAccess,
  requireCompetitionAccess,
  requireCompetitorAccess,
  requireMatAccess,
} from './competition-access.util';

// These helpers are pure functions over a Prisma client. The tests use
// inline jest mocks for the client surface — same pattern as the service
// specs. The point is to lock in the (NotFound | Forbidden | success)
// triad uniformly so future refactors don't accidentally drop a check.

function mockPrisma() {
  return {
    competition: { findUnique: jest.fn() },
    competitor: { findUnique: jest.fn() },
    category: { findUnique: jest.fn() },
    mat: { findUnique: jest.fn() },
  } as unknown as Parameters<typeof requireCompetitionAccess>[0] & {
    competition: { findUnique: jest.Mock };
    competitor: { findUnique: jest.Mock };
    category: { findUnique: jest.Mock };
    mat: { findUnique: jest.Mock };
  };
}

describe('requireCompetitionAccess', () => {
  it('returns the competition when organizer matches', async () => {
    const prisma = mockPrisma();
    prisma.competition.findUnique.mockResolvedValue({
      id: 'comp-1',
      organizerId: 'org-1',
    });

    const result = await requireCompetitionAccess(prisma, 'comp-1', 'org-1');
    expect(result.id).toBe('comp-1');
  });

  it('throws NotFound when missing', async () => {
    const prisma = mockPrisma();
    prisma.competition.findUnique.mockResolvedValue(null);
    await expect(requireCompetitionAccess(prisma, 'x', 'org-1')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('throws Forbidden when wrong organizer', async () => {
    const prisma = mockPrisma();
    prisma.competition.findUnique.mockResolvedValue({
      id: 'comp-1',
      organizerId: 'other',
    });
    await expect(requireCompetitionAccess(prisma, 'comp-1', 'org-1')).rejects.toThrow(
      ForbiddenException,
    );
  });
});

describe('requireCompetitorAccess', () => {
  it('includes competition in the returned record', async () => {
    const prisma = mockPrisma();
    prisma.competitor.findUnique.mockResolvedValue({
      id: 'c-1',
      competition: { organizerId: 'org-1', status: 'WEIGH_IN' },
    });
    const result = await requireCompetitorAccess(prisma, 'c-1', 'org-1');
    expect(result.competition.status).toBe('WEIGH_IN');
  });

  it('throws Forbidden via competition.organizerId mismatch', async () => {
    const prisma = mockPrisma();
    prisma.competitor.findUnique.mockResolvedValue({
      id: 'c-1',
      competition: { organizerId: 'other' },
    });
    await expect(requireCompetitorAccess(prisma, 'c-1', 'org-1')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('throws NotFound when missing', async () => {
    const prisma = mockPrisma();
    prisma.competitor.findUnique.mockResolvedValue(null);
    await expect(requireCompetitorAccess(prisma, 'x', 'org-1')).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('requireCategoryAccess', () => {
  it('returns category with competition when authorized', async () => {
    const prisma = mockPrisma();
    prisma.category.findUnique.mockResolvedValue({
      id: 'cat-1',
      competition: { organizerId: 'org-1' },
    });
    const result = await requireCategoryAccess(prisma, 'cat-1', 'org-1');
    expect(result.id).toBe('cat-1');
  });

  it('throws Forbidden / NotFound consistently', async () => {
    const prisma = mockPrisma();
    prisma.category.findUnique.mockResolvedValueOnce(null);
    await expect(requireCategoryAccess(prisma, 'x', 'org-1')).rejects.toThrow(
      NotFoundException,
    );
    prisma.category.findUnique.mockResolvedValueOnce({
      id: 'cat-1',
      competition: { organizerId: 'other' },
    });
    await expect(requireCategoryAccess(prisma, 'cat-1', 'org-1')).rejects.toThrow(
      ForbiddenException,
    );
  });
});

describe('requireMatAccess', () => {
  it('returns mat with competition when authorized', async () => {
    const prisma = mockPrisma();
    prisma.mat.findUnique.mockResolvedValue({
      id: 'mat-1',
      competition: { organizerId: 'org-1' },
    });
    const result = await requireMatAccess(prisma, 'mat-1', 'org-1');
    expect(result.id).toBe('mat-1');
  });

  it('throws Forbidden / NotFound consistently', async () => {
    const prisma = mockPrisma();
    prisma.mat.findUnique.mockResolvedValueOnce(null);
    await expect(requireMatAccess(prisma, 'x', 'org-1')).rejects.toThrow(
      NotFoundException,
    );
    prisma.mat.findUnique.mockResolvedValueOnce({
      id: 'mat-1',
      competition: { organizerId: 'other' },
    });
    await expect(requireMatAccess(prisma, 'mat-1', 'org-1')).rejects.toThrow(
      ForbiddenException,
    );
  });
});
