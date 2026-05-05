import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AgeGroup, Gender } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { determineAgeGroup } from './age-group.util';
import { IJF_WEIGHT_CLASSES, WeightClass } from './ijf-weight-classes';

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

    await this.prisma.competitor.updateMany({
      where: { competitionId },
      data: { categoryId: null },
    });
    await this.prisma.category.deleteMany({
      where: { competitionId },
    });

    const competitors = await this.prisma.competitor.findMany({
      where: {
        competitionId,
        registrationStatus: 'WEIGHED_IN',
      },
    });

    const categoryMap = new Map<string, { weightClass: WeightClass; competitorIds: string[] }>();

    for (const competitor of competitors) {
      if (!competitor.weight) continue;

      const ageGroup = determineAgeGroup(competitor.dateOfBirth, competition.date);
      const weightClass = this.findWeightClass(
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

      const category = await this.prisma.category.create({
        data: {
          competitionId,
          name,
          gender: weightClass.gender,
          ageGroup: weightClass.ageGroup,
          minWeight: weightClass.minWeight,
          maxWeight: weightClass.maxWeight,
        },
      });

      await this.prisma.competitor.updateMany({
        where: { id: { in: competitorIds } },
        data: { categoryId: category.id },
      });

      createdCategories.push({
        ...category,
        competitorCount: competitorIds.length,
      });
    }

    return createdCategories;
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
    const weightClass = this.findWeightClass(
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
      },
      orderBy: [{ gender: 'asc' }, { ageGroup: 'asc' }, { minWeight: 'asc' }],
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

  private findWeightClass(
    gender: Gender,
    ageGroup: AgeGroup,
    weight: number,
  ): WeightClass | undefined {
    return IJF_WEIGHT_CLASSES.find(
      (wc) =>
        wc.gender === gender &&
        wc.ageGroup === ageGroup &&
        weight > wc.minWeight &&
        weight <= wc.maxWeight,
    );
  }
}
