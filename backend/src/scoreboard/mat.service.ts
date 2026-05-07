import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MatService {
  constructor(private prisma: PrismaService) {}

  async createMats(competitionId: string, count: number, organizerId: string) {
    const competition = await this.prisma.competition.findUnique({
      where: { id: competitionId },
    });
    if (!competition) throw new NotFoundException('Competition not found');
    if (competition.organizerId !== organizerId) throw new ForbiddenException();

    const existing = await this.prisma.mat.count({ where: { competitionId } });

    const mats = [];
    for (let i = 1; i <= count; i++) {
      const pin = String(Math.floor(100000 + Math.random() * 900000));
      const mat = await this.prisma.mat.create({
        data: {
          competitionId,
          number: existing + i,
          pin,
        },
      });
      mats.push(mat);
    }

    return mats;
  }

  async getMats(competitionId: string) {
    return this.prisma.mat.findMany({
      where: { competitionId },
      include: {
        categories: {
          select: {
            id: true,
            name: true,
            _count: { select: { competitors: true } },
          },
          orderBy: [{ gender: 'asc' }, { ageGroup: 'asc' }, { minWeight: 'asc' }],
        },
      },
      orderBy: { number: 'asc' },
    });
  }

  async assignMatchToMat(matId: string, matchId: string, organizerId: string) {
    const mat = await this.prisma.mat.findUnique({
      where: { id: matId },
      include: { competition: true },
    });
    if (!mat) throw new NotFoundException('Mat not found');
    if (mat.competition.organizerId !== organizerId) throw new ForbiddenException();

    return this.prisma.mat.update({
      where: { id: matId },
      data: { currentMatchId: matchId },
    });
  }

  async verifyPin(matId: string, pin: string): Promise<boolean> {
    const mat = await this.prisma.mat.findUnique({ where: { id: matId } });
    if (!mat) throw new NotFoundException('Mat not found');
    return mat.pin === pin;
  }
}
