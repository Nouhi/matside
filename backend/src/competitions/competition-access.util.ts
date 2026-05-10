import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type {
  Category,
  Competition,
  Competitor,
  Mat,
  Prisma,
  PrismaClient,
} from '@prisma/client';

// Shared resource-access helpers. Every organizer-only mutation in the app
// has historically duplicated this two-step pattern:
//
//   const x = await prisma.X.findUnique({ where: { id }, include: { competition: true } });
//   if (!x) throw new NotFoundException(...);
//   if (x.competition.organizerId !== organizerId) throw new ForbiddenException();
//
// Three near-identical copies (competitors, categories, mats) was the trigger
// from the eng review to extract before adding a fourth (coach accounts).
//
// These are plain functions, not a NestJS service, so callers don't have to
// add a new module dependency. Each takes the prisma client they already have
// and returns the loaded resource with the competition attached.
//
// Future role checks (COACH access to "their" athletes, etc.) get layered on
// top of this without changing call sites — add an optional allowedRoles arg
// once the User-Coach-Competitor link exists.

type PrismaLike = PrismaClient | Prisma.TransactionClient;

export type CompetitorWithCompetition = Competitor & { competition: Competition };
export type CategoryWithCompetition = Category & { competition: Competition };
export type MatWithCompetition = Mat & { competition: Competition };

export async function requireCompetitionAccess(
  prisma: PrismaLike,
  competitionId: string,
  organizerId: string,
): Promise<Competition> {
  const competition = await prisma.competition.findUnique({
    where: { id: competitionId },
  });
  if (!competition) throw new NotFoundException('Competition not found');
  if (competition.organizerId !== organizerId) throw new ForbiddenException();
  return competition;
}

export async function requireCompetitorAccess(
  prisma: PrismaLike,
  competitorId: string,
  organizerId: string,
): Promise<CompetitorWithCompetition> {
  const competitor = await prisma.competitor.findUnique({
    where: { id: competitorId },
    include: { competition: true },
  });
  if (!competitor) throw new NotFoundException('Competitor not found');
  if (competitor.competition.organizerId !== organizerId) {
    throw new ForbiddenException();
  }
  return competitor;
}

export async function requireCategoryAccess(
  prisma: PrismaLike,
  categoryId: string,
  organizerId: string,
): Promise<CategoryWithCompetition> {
  const category = await prisma.category.findUnique({
    where: { id: categoryId },
    include: { competition: true },
  });
  if (!category) throw new NotFoundException('Category not found');
  if (category.competition.organizerId !== organizerId) {
    throw new ForbiddenException();
  }
  return category;
}

export async function requireMatAccess(
  prisma: PrismaLike,
  matId: string,
  organizerId: string,
): Promise<MatWithCompetition> {
  const mat = await prisma.mat.findUnique({
    where: { id: matId },
    include: { competition: true },
  });
  if (!mat) throw new NotFoundException('Mat not found');
  if (mat.competition.organizerId !== organizerId) {
    throw new ForbiddenException();
  }
  return mat;
}
