import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BracketType, MatchPhase } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { generateRoundRobinMatches } from './round-robin.util';
import { generatePoolsMatches, isPoolsBracketSize } from './pools.util';
import { generateDoubleRepechageMatches } from './double-repechage.util';

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
        } else if (isPoolsBracketSize(competitorCount)) {
          bracketType = BracketType.POOLS;
        } else {
          // 16+ competitors: real IJF double-repechage. Main bracket + 2
          // repechage paths + 2 bronze fights = 2 distinct bronze medalists.
          bracketType = BracketType.DOUBLE_REPECHAGE;
        }

        await tx.category.update({
          where: { id: category.id },
          data: { bracketType },
        });

        await tx.match.deleteMany({
          where: { categoryId: category.id },
        });

        const competitorIds = category.competitors.map((c) => c.id);
        const matchesToCreate: {
          round: number;
          poolPosition: number;
          competitor1Id: string | null;
          competitor2Id: string | null;
          phase: MatchPhase | null;
          poolGroup: string | null;
        }[] = [];

        if (bracketType === BracketType.ROUND_ROBIN) {
          const pairings = generateRoundRobinMatches(competitorCount);
          for (const p of pairings) {
            matchesToCreate.push({
              round: p.round,
              poolPosition: p.poolPosition,
              competitor1Id: p.competitor1Index !== null ? competitorIds[p.competitor1Index] : null,
              competitor2Id: p.competitor2Index !== null ? competitorIds[p.competitor2Index] : null,
              phase: null,
              poolGroup: null,
            });
          }
        } else if (bracketType === BracketType.POOLS) {
          const poolMatches = generatePoolsMatches(competitorCount);
          for (const pm of poolMatches) {
            matchesToCreate.push({
              round: pm.round,
              poolPosition: pm.poolPosition,
              competitor1Id: competitorIds[pm.competitor1Index],
              competitor2Id: competitorIds[pm.competitor2Index],
              phase: MatchPhase.POOL,
              poolGroup: pm.poolGroup,
            });
          }
          // Knockout matches are NOT generated upfront. They get created by
          // scoreboard.service.advanceWinner once the pool stage completes,
          // because we need actual standings to fill in competitor IDs.
        } else {
          // DOUBLE_REPECHAGE (16+ competitors): main bracket + 2 repechage +
          // 2 bronze placeholder slots.
          const drMatches = generateDoubleRepechageMatches(competitorCount);
          for (const m of drMatches) {
            matchesToCreate.push({
              round: m.round,
              poolPosition: m.poolPosition,
              competitor1Id: m.competitor1Index !== null ? competitorIds[m.competitor1Index] : null,
              competitor2Id: m.competitor2Index !== null ? competitorIds[m.competitor2Index] : null,
              phase: m.phase as MatchPhase | null,
              poolGroup: m.poolGroup,
            });
          }
        }

        let sequenceNum = 0;
        for (const match of matchesToCreate) {
          sequenceNum++;

          // R1 bye: only one competitor, the other is null. Mark COMPLETED
          // immediately so the bracket UI shows the bye-getter advancing,
          // and so any "next match on this mat" queue logic skips past it.
          // Knockout-only phases (REPECHAGE, KNOCKOUT_BRONZE) always have
          // both competitors null at generation; never auto-complete those.
          const isR1Bye =
            match.round === 1 &&
            match.phase === null &&
            ((match.competitor1Id === null) !== (match.competitor2Id === null));
          const winnerId = isR1Bye
            ? (match.competitor1Id ?? match.competitor2Id)
            : null;

          await tx.match.create({
            data: {
              categoryId: category.id,
              round: match.round,
              poolPosition: match.poolPosition,
              competitor1Id: match.competitor1Id,
              competitor2Id: match.competitor2Id,
              duration: competition.matchDuration,
              sequenceNum,
              phase: match.phase,
              poolGroup: match.poolGroup,
              matId: category.matId ?? null,
              ...(isR1Bye && winnerId
                ? {
                    status: 'COMPLETED',
                    winnerId,
                    winMethod: 'FUSEN_GACHI', // walkover / no opponent
                  }
                : {}),
            },
          });
        }

        summary.push({
          categoryId: category.id,
          categoryName: category.name,
          competitorCount,
          bracketType,
          matchCount: matchesToCreate.length,
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
