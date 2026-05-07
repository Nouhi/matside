import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BracketType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { generateRoundRobinMatches } from './round-robin.util';
import { generateSingleRepechageMatches } from './single-repechage.util';

@Injectable()
export class BracketsService {
  constructor(private prisma: PrismaService) {}

  async generateBrackets(competitionId: string, organizerId: string) {
    const competition = await this.prisma.competition.findUnique({
      where: { id: competitionId },
    });
    if (!competition) {
      throw new NotFoundException('Competition not found');
    }
    if (competition.organizerId !== organizerId) {
      throw new ForbiddenException();
    }
    if (competition.status !== 'WEIGH_IN' && competition.status !== 'ACTIVE') {
      throw new BadRequestException(
        'Competition must be in WEIGH_IN or ACTIVE status to generate brackets',
      );
    }

    const categories = await this.prisma.category.findMany({
      where: { competitionId },
      include: { competitors: true },
    });

    return this.prisma.$transaction(async (tx) => {
      const summary = [];

      for (const category of categories) {
        const competitorCount = category.competitors.length;
        if (competitorCount < 2) continue;

        let bracketType: BracketType;
        if (competitorCount <= 4) {
          bracketType = BracketType.ROUND_ROBIN;
        } else {
          // ENG-A3 (TODOS.md): we tag all 5+ competitor categories as SINGLE_REPECHAGE
          // until proper DOUBLE_REPECHAGE bracket-section + bronze fights are implemented.
          // Today, single-repechage.util generates the same shape for both.
          bracketType = BracketType.SINGLE_REPECHAGE;
        }

        await tx.category.update({
          where: { id: category.id },
          data: { bracketType },
        });

        await tx.match.deleteMany({
          where: { categoryId: category.id },
        });

        const competitorIds = category.competitors.map((c) => c.id);
        let matches: { round: number; poolPosition: number; competitor1Id: string | null; competitor2Id: string | null }[];

        if (bracketType === BracketType.ROUND_ROBIN) {
          const pairings = generateRoundRobinMatches(competitorCount);
          matches = pairings.map((p) => ({
            round: p.round,
            poolPosition: p.poolPosition,
            competitor1Id: p.competitor1Index !== null ? competitorIds[p.competitor1Index] : null,
            competitor2Id: p.competitor2Index !== null ? competitorIds[p.competitor2Index] : null,
          }));
        } else {
          const pairings = generateSingleRepechageMatches(competitorCount);
          matches = pairings.map((p) => ({
            round: p.round,
            poolPosition: p.poolPosition,
            competitor1Id: p.competitor1Index !== null ? competitorIds[p.competitor1Index] : null,
            competitor2Id: p.competitor2Index !== null ? competitorIds[p.competitor2Index] : null,
          }));
        }

        let sequenceNum = 0;
        for (const match of matches) {
          sequenceNum++;
          await tx.match.create({
            data: {
              categoryId: category.id,
              round: match.round,
              poolPosition: match.poolPosition,
              competitor1Id: match.competitor1Id,
              competitor2Id: match.competitor2Id,
              duration: competition.matchDuration,
              sequenceNum,
            },
          });
        }

        summary.push({
          categoryId: category.id,
          categoryName: category.name,
          competitorCount,
          bracketType,
          matchCount: matches.length,
        });
      }

      return summary;
    });
  }

  async getBrackets(competitionId: string) {
    const competition = await this.prisma.competition.findUnique({
      where: { id: competitionId },
    });
    if (!competition) {
      throw new NotFoundException('Competition not found');
    }

    return this.prisma.category.findMany({
      where: { competitionId },
      include: {
        competitors: true,
        matches: {
          include: {
            competitor1: true,
            competitor2: true,
            winner: true,
          },
          orderBy: [{ round: 'asc' }, { poolPosition: 'asc' }],
        },
      },
      orderBy: [{ gender: 'asc' }, { ageGroup: 'asc' }, { minWeight: 'asc' }],
    });
  }
}
