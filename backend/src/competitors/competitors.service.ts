import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Gender, RegistrationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CompetitorsService {
  constructor(private prisma: PrismaService) {}

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
  ) {
    const competition = await this.prisma.competition.findUnique({
      where: { id: competitionId },
    });
    if (!competition) {
      throw new NotFoundException('Competition not found');
    }
    if (competition.status !== 'REGISTRATION') {
      throw new BadRequestException('Competition is not open for registration');
    }

    return this.prisma.competitor.create({
      data: {
        competitionId,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email ?? '',
        dateOfBirth: data.dateOfBirth,
        gender: data.gender,
        weight: data.weight,
        club: data.club ?? '',
      },
    });
  }

  findAll(competitionId: string) {
    return this.prisma.competitor.findMany({
      where: { competitionId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateStatus(id: string, status: RegistrationStatus) {
    const competitor = await this.prisma.competitor.findUnique({
      where: { id },
    });
    if (!competitor) {
      throw new NotFoundException('Competitor not found');
    }

    return this.prisma.competitor.update({
      where: { id },
      data: { registrationStatus: status },
    });
  }
}
