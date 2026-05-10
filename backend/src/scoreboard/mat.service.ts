import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  requireCompetitionAccess,
  requireMatAccess,
} from '../competitions/competition-access.util';

@Injectable()
export class MatService {
  constructor(private prisma: PrismaService) {}

  async createMats(competitionId: string, count: number, organizerId: string) {
    await requireCompetitionAccess(this.prisma, competitionId, organizerId);

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
    const mats = await this.prisma.mat.findMany({
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

    // Build the queue (next ready matches) per mat.
    const matsWithQueue = await Promise.all(
      mats.map(async (mat) => {
        const currentMatch = mat.currentMatchId
          ? await this.prisma.match.findUnique({
              where: { id: mat.currentMatchId },
              include: {
                competitor1: { select: { id: true, firstName: true, lastName: true, club: true } },
                competitor2: { select: { id: true, firstName: true, lastName: true, club: true } },
                category: { select: { name: true } },
              },
            })
          : null;

        const nextMatches = await this.prisma.match.findMany({
          where: {
            matId: mat.id,
            status: 'SCHEDULED',
            competitor1Id: { not: null },
            competitor2Id: { not: null },
            id: mat.currentMatchId ? { not: mat.currentMatchId } : undefined,
          },
          orderBy: [{ categoryId: 'asc' }, { sequenceNum: 'asc' }],
          take: 8,
          include: {
            competitor1: { select: { id: true, firstName: true, lastName: true, club: true } },
            competitor2: { select: { id: true, firstName: true, lastName: true, club: true } },
            category: { select: { name: true } },
          },
        });

        return { ...mat, currentMatch, nextMatches };
      }),
    );

    return matsWithQueue;
  }

  async assignMatchToMat(matId: string, matchId: string, organizerId: string) {
    await requireMatAccess(this.prisma, matId, organizerId);
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
