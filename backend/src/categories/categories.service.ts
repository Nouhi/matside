import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Gender } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { determineAgeGroup } from './age-group.util';
import { findIjfWeightClass, WeightClass } from './ijf-weight-classes';

@Injectable()
export class CategoriesService {
  constructor(private prisma: PrismaService) {}

  async generateCategories(competitionId: string, organizerId: string) {
    const competition = await this.prisma.competition.findUnique({
      where: { id: competitionId },
    });
    if (!competition) {
      throw new NotFoundException('Competition not found');
    }
    if (competition.organizerId !== organizerId) {
      throw new ForbiddenException();
    }
    if (competition.status !== 'WEIGH_IN') {
      throw new BadRequestException(
        'Competition must be in WEIGH_IN status to generate categories',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.competitor.updateMany({
        where: { competitionId },
        data: { categoryId: null },
      });
      await tx.category.deleteMany({
        where: { competitionId },
      });

      const competitors = await tx.competitor.findMany({
        where: {
          competitionId,
          registrationStatus: 'WEIGHED_IN',
        },
      });

      const categoryMap = new Map<string, { weightClass: WeightClass; competitorIds: string[] }>();

      for (const competitor of competitors) {
        if (!competitor.weight) continue;

        const ageGroup = determineAgeGroup(competitor.dateOfBirth, competition.date);
        const weightClass = findIjfWeightClass(
          competitor.gender as Gender,
          ageGroup,
          Number(competitor.weight),
        );

        if (!weightClass) continue;

        const key = `${weightClass.gender}-${weightClass.ageGroup}-${weightClass.label}`;
        if (!categoryMap.has(key)) {
          categoryMap.set(key, { weightClass, competitorIds: [] });
        }
        categoryMap.get(key)!.competitorIds.push(competitor.id);
      }

      const createdCategories = [];

      for (const [, { weightClass, competitorIds }] of categoryMap) {
        if (competitorIds.length === 0) continue;

        const genderLabel = weightClass.gender === 'MALE' ? 'Men' : 'Women';
        const name = `${weightClass.ageGroup} ${genderLabel} ${weightClass.label}kg`;

        const category = await tx.category.create({
          data: {
            competitionId,
            name,
            gender: weightClass.gender,
            ageGroup: weightClass.ageGroup,
            minWeight: weightClass.minWeight,
            maxWeight: weightClass.maxWeight,
          },
        });

        await tx.competitor.updateMany({
          where: { id: { in: competitorIds } },
          data: { categoryId: category.id },
        });

        createdCategories.push({
          ...category,
          competitorCount: competitorIds.length,
        });
      }

      return createdCategories;
    });
  }

  async assignCompetitor(competitorId: string, organizerId: string) {
    const competitor = await this.prisma.competitor.findUnique({
      where: { id: competitorId },
      include: { competition: true },
    });
    if (!competitor) {
      throw new NotFoundException('Competitor not found');
    }
    if (competitor.competition.organizerId !== organizerId) {
      throw new ForbiddenException();
    }
    if (!competitor.weight) {
      throw new BadRequestException('Competitor has no recorded weight');
    }

    const ageGroup = determineAgeGroup(
      competitor.dateOfBirth,
      competitor.competition.date,
    );
    const weightClass = findIjfWeightClass(
      competitor.gender as Gender,
      ageGroup,
      Number(competitor.weight),
    );

    if (!weightClass) {
      throw new BadRequestException('No matching weight class found');
    }

    const category = await this.prisma.category.findFirst({
      where: {
        competitionId: competitor.competitionId,
        gender: weightClass.gender,
        ageGroup: weightClass.ageGroup,
        minWeight: weightClass.minWeight,
        maxWeight: weightClass.maxWeight,
      },
    });

    if (!category) {
      throw new BadRequestException(
        'No matching category exists for this competition. Generate categories first.',
      );
    }

    return this.prisma.competitor.update({
      where: { id: competitorId },
      data: { categoryId: category.id },
    });
  }

  findAll(competitionId: string) {
    return this.prisma.category.findMany({
      where: { competitionId },
      include: {
        _count: { select: { competitors: true } },
        mat: { select: { id: true, number: true } },
      },
      orderBy: [{ gender: 'asc' }, { ageGroup: 'asc' }, { minWeight: 'asc' }],
    });
  }

  async assignCategoriesToMats(competitionId: string, organizerId: string) {
    const competition = await this.prisma.competition.findUnique({
      where: { id: competitionId },
    });
    if (!competition) throw new NotFoundException('Competition not found');
    if (competition.organizerId !== organizerId) throw new ForbiddenException();

    const mats = await this.prisma.mat.findMany({
      where: { competitionId },
      orderBy: { number: 'asc' },
    });
    if (mats.length === 0) {
      throw new BadRequestException('No mats configured for this competition');
    }

    const categories = await this.prisma.category.findMany({
      where: { competitionId },
      include: { _count: { select: { competitors: true } } },
    });
    if (categories.length === 0) {
      throw new BadRequestException('No categories to assign');
    }

    // Sort categories by competitor count desc — heavier categories placed first
    // so the load-balance algorithm distributes the bigger categories evenly.
    const sorted = [...categories].sort(
      (a, b) => b._count.competitors - a._count.competitors,
    );

    const matLoad = new Map<string, number>();
    for (const mat of mats) matLoad.set(mat.id, 0);

    return this.prisma.$transaction(async (tx) => {
      const assignments: { categoryId: string; matId: string }[] = [];
      for (const cat of sorted) {
        // Pick the mat with the lowest current competitor load
        let pickedId = mats[0].id;
        let pickedLoad = matLoad.get(pickedId)!;
        for (const mat of mats) {
          const load = matLoad.get(mat.id)!;
          if (load < pickedLoad) {
            pickedId = mat.id;
            pickedLoad = load;
          }
        }
        matLoad.set(pickedId, pickedLoad + cat._count.competitors);
        assignments.push({ categoryId: cat.id, matId: pickedId });
      }

      for (const a of assignments) {
        await tx.category.update({
          where: { id: a.categoryId },
          data: { matId: a.matId },
        });
        // Cascade matId to all this category's matches that haven't been
        // played yet, so the per-mat queue picks them up.
        await tx.match.updateMany({
          where: { categoryId: a.categoryId, status: { not: 'COMPLETED' } },
          data: { matId: a.matId },
        });
      }

      return mats.map((mat) => ({
        matId: mat.id,
        matNumber: mat.number,
        competitors: matLoad.get(mat.id) ?? 0,
        categories: assignments
          .filter((a) => a.matId === mat.id)
          .map((a) => sorted.find((c) => c.id === a.categoryId)?.name ?? ''),
      }));
    });
  }

  async assignCategoryToMat(
    categoryId: string,
    matId: string | null,
    organizerId: string,
  ) {
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
      include: { competition: true },
    });
    if (!category) throw new NotFoundException('Category not found');
    if (category.competition.organizerId !== organizerId) throw new ForbiddenException();

    if (matId) {
      const mat = await this.prisma.mat.findUnique({ where: { id: matId } });
      if (!mat) throw new NotFoundException('Mat not found');
      if (mat.competitionId !== category.competitionId) {
        throw new BadRequestException('Mat is not in the same competition');
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.category.update({
        where: { id: categoryId },
        data: { matId },
        include: { mat: { select: { id: true, number: true } } },
      });
      // Cascade to non-completed matches so the queue tracks the override.
      await tx.match.updateMany({
        where: { categoryId, status: { not: 'COMPLETED' } },
        data: { matId },
      });
      return updated;
    });
  }

  async findOne(id: string) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: {
        competitors: true,
        matches: {
          include: {
            competitor1: true,
            competitor2: true,
          },
          orderBy: [{ round: 'asc' }, { poolPosition: 'asc' }],
        },
      },
    });
    if (!category) {
      throw new NotFoundException('Category not found');
    }
    return category;
  }

}
