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
      licenseNumber?: string;
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
          licenseNumber: data.licenseNumber,
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

  /**
   * Atomic weigh-in: record actual weight, mark WEIGHED_IN, return the
   * before/after IJF projection so the UI can show "bumped from -73 to -81kg".
   *
   * Critical-gap protection (the silent-corruption bug from the eng review):
   * - Refuse if the competition is past WEIGH_IN — once brackets are live,
   *   nullifying categoryId would orphan match references.
   * - Refuse if the competitor's current category has any non-SCHEDULED match
   *   (ACTIVE or COMPLETED) — they're mid-tournament, can't be moved out.
   *   Use disqualify() instead in that case (existing match state preserved,
   *   competitor marked WITHDRAWN, opponents handled via existing FUSEN_GACHI
   *   walkover semantics).
   *
   * The weight update + status flip + categoryId null happen in one tx so a
   * crash mid-flow can't leave the competitor in a half-recategorized state.
   */
  async recordWeight(
    id: string,
    organizerId: string,
    weight: number,
  ): Promise<CompetitorWithProjection & {
    previousProjection: IjfProjection;
    bumped: boolean;
  }> {
    const competitor = await this.prisma.competitor.findUnique({
      where: { id },
      include: {
        competition: true,
        category: { select: { id: true, name: true } },
      },
    });
    if (!competitor) throw new NotFoundException('Competitor not found');
    if (competitor.competition.organizerId !== organizerId) {
      throw new ForbiddenException();
    }
    if (competitor.competition.status !== 'WEIGH_IN') {
      throw new BadRequestException(
        'Competition must be in WEIGH_IN status to record weight',
      );
    }

    if (competitor.categoryId) {
      const inFlightMatch = await this.prisma.match.findFirst({
        where: {
          categoryId: competitor.categoryId,
          status: { not: 'SCHEDULED' },
        },
        select: { id: true },
      });
      if (inFlightMatch) {
        throw new BadRequestException(
          'Cannot change weight after matches have started in this category. ' +
            'Disqualify the competitor instead.',
        );
      }
    }

    const previousProjection = projectIjfCategory(competitor, competitor.competition.date);

    const updated = await this.prisma.competitor.update({
      where: { id },
      data: {
        weight,
        categoryId: null,
        registrationStatus: RegistrationStatus.WEIGHED_IN,
      },
    });

    const newProjection = projectIjfCategory(updated, competitor.competition.date);
    const bumped =
      previousProjection.weightLabel !== null &&
      newProjection.weightLabel !== null &&
      previousProjection.weightLabel !== newProjection.weightLabel;

    return {
      ...updated,
      projection: newProjection,
      previousProjection,
      bumped,
    };
  }

  /**
   * Organizer-driven disqualification. Distinct from the existing self-
   * withdrawal because:
   * - It works at any competition status (an athlete can be DQ'd mid-bracket
   *   for HANSOKU_MAKE, missed weigh-in, no-show, etc.)
   * - The match state is preserved; in-flight matches the competitor was in
   *   continue to resolve via the existing winner-advancement logic.
   *
   * We do NOT null categoryId here — the competitor needs to stay in the
   * bracket so existing matches can resolve them as walkover losers. The
   * frontend distinguishes WITHDRAWN visually (struck-through row).
   */
  async disqualify(id: string, organizerId: string) {
    const competitor = await this.prisma.competitor.findUnique({
      where: { id },
      include: { competition: true },
    });
    if (!competitor) throw new NotFoundException('Competitor not found');
    if (competitor.competition.organizerId !== organizerId) {
      throw new ForbiddenException();
    }

    return this.prisma.competitor.update({
      where: { id },
      data: { registrationStatus: RegistrationStatus.WITHDRAWN },
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
