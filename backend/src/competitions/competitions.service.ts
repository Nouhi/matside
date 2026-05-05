import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CompetitionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CompetitionsService {
  constructor(private prisma: PrismaService) {}

  create(organizerId: string, data: { name: string; date: Date; location?: string }) {
    return this.prisma.competition.create({
      data: {
        name: data.name,
        date: data.date,
        location: data.location ?? '',
        organizerId,
      },
    });
  }

  findAll(organizerId: string) {
    return this.prisma.competition.findMany({
      where: { organizerId },
      orderBy: { date: 'desc' },
    });
  }

  async findOne(id: string, organizerId: string) {
    const competition = await this.prisma.competition.findUnique({
      where: { id },
    });
    if (!competition) {
      throw new NotFoundException('Competition not found');
    }
    if (competition.organizerId !== organizerId) {
      throw new ForbiddenException();
    }
    return competition;
  }

  async update(
    id: string,
    organizerId: string,
    data: { name?: string; date?: Date; location?: string; status?: CompetitionStatus },
  ) {
    await this.findOne(id, organizerId);
    return this.prisma.competition.update({
      where: { id },
      data,
    });
  }

  async delete(id: string, organizerId: string) {
    await this.findOne(id, organizerId);
    return this.prisma.competition.delete({ where: { id } });
  }
}
