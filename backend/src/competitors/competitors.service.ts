import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Competitor, Gender, RegistrationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  IjfProjection,
  projectIjfCategory,
} from '../categories/ijf-projection.util';
import { AthletesService } from '../athletes/athletes.service';

export type CompetitorWithProjection = Competitor & { projection: IjfProjection };

@Injectable()
export class CompetitorsService {
  constructor(
    private prisma: PrismaService,
    private athletesService: AthletesService,
  ) {}

  async register(
    competitionId: string,
    data: {
      firstName: string;
      lastName: string;
      email?: string;
      dateOfBirth: Date;
      gender: Gender;
      weight?: number;
      club?: string;
    },
  ): Promise<CompetitorWithProjection> {
    const competition = await this.prisma.competition.findUnique({
      where: { id: competitionId },
    });
    if (!competition) {
      throw new NotFoundException('Competition not found');
    }
    if (competition.status !== 'REGISTRATION') {
      throw new BadRequestException('Competition is not open for registration');
    }

    if (data.email) {
      const existing = await this.prisma.competitor.findFirst({
        where: { competitionId, email: data.email },
      });
      if (existing) {
        throw new BadRequestException(
          'A competitor with this email is already registered',
        );
      }
    }

    // Wrap in a transaction so the athlete row and the competitor row land
    // together. If the athlete create fails, we don't get an orphan
    // registration, and vice versa.
    const created = await this.prisma.$transaction(async (tx) => {
      const athlete = await this.athletesService.findOrCreateForRegistration(
        {
          firstName: data.firstName,
          lastName: data.lastName,
          email: data.email ?? '',
          dateOfBirth: data.dateOfBirth,
          gender: data.gender,
        },
        tx,
      );

      return tx.competitor.create({
        data: {
          competitionId,
          athleteId: athlete.id,
          firstName: data.firstName,
          lastName: data.lastName,
          email: data.email ?? '',
          dateOfBirth: data.dateOfBirth,
          gender: data.gender,
          weight: data.weight,
          club: data.club ?? '',
        },
      });
    });

    return { ...created, projection: projectIjfCategory(created, competition.date) };
  }

  async findAll(competitionId: string): Promise<CompetitorWithProjection[]> {
    const competition = await this.prisma.competition.findUnique({
      where: { id: competitionId },
      select: { date: true },
    });
    const competitors = await this.prisma.competitor.findMany({
      where: { competitionId },
      orderBy: { createdAt: 'desc' },
    });
    if (!competition) return [];
    return competitors.map((c) => ({
      ...c,
      projection: projectIjfCategory(c, competition.date),
    }));
  }

  async updateWeight(id: string, organizerId: string, weight: number) {
    const competitor = await this.prisma.competitor.findUnique({
      where: { id },
      include: { competition: true },
    });
    if (!competitor) {
      throw new NotFoundException('Competitor not found');
    }
    if (competitor.competition.organizerId !== organizerId) {
      throw new ForbiddenException();
    }
    if (competitor.competition.status !== 'WEIGH_IN') {
      throw new BadRequestException('Competition must be in WEIGH_IN status to update weight');
    }

    return this.prisma.competitor.update({
      where: { id },
      data: { weight, categoryId: null },
    });
  }

  async withdraw(id: string, organizerId: string) {
    const competitor = await this.prisma.competitor.findUnique({
      where: { id },
      include: { competition: true },
    });
    if (!competitor) {
      throw new NotFoundException('Competitor not found');
    }
    if (competitor.competition.organizerId !== organizerId) {
      throw new ForbiddenException();
    }

    return this.prisma.competitor.update({
      where: { id },
      data: { registrationStatus: RegistrationStatus.WITHDRAWN, categoryId: null },
    });
  }

  async updateStatus(id: string, organizerId: string, status: RegistrationStatus) {
    const competitor = await this.prisma.competitor.findUnique({
      where: { id },
      include: { competition: true },
    });
    if (!competitor) {
      throw new NotFoundException('Competitor not found');
    }
    if (competitor.competition.organizerId !== organizerId) {
      throw new ForbiddenException();
    }

    return this.prisma.competitor.update({
      where: { id },
      data: { registrationStatus: status },
    });
  }
}
