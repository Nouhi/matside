import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  expectedRoundRobinMatchCount,
  isRoundRobinComplete,
  rankRoundRobin,
} from './round-robin.util';
import { computeEliminationStandings } from './elimination.util';
import { computePoolsStandings } from './pools.util';
import { MatchScores, StandingMatch } from './standings.types';

export interface CompetitorRef {
  id: string;
  firstName: string;
  lastName: string;
  club: string;
}

export interface StandingEntry {
  rank: number;
  competitor: CompetitorRef;
  wins?: number;
  losses?: number;
  ippons?: number;
  wazaAriWins?: number;
  shidosReceived?: number;
  tiedWith?: string[];
}

export interface CategoryStandings {
  categoryId: string;
  categoryName: string;
  bracketType: 'ROUND_ROBIN' | 'POOLS' | 'SINGLE_REPECHAGE' | 'DOUBLE_REPECHAGE';
  status: 'IN_PROGRESS' | 'COMPLETE' | 'PENDING_PLAYOFF';
  standings: StandingEntry[];
}

@Injectable()
export class StandingsService {
  constructor(private prisma: PrismaService) {}

  async getCompetitionStandings(competitionId: string): Promise<CategoryStandings[]> {
    const competition = await this.prisma.competition.findUnique({
      where: { id: competitionId },
    });
    if (!competition) throw new NotFoundException('Competition not found');

    const categories = await this.prisma.category.findMany({
      where: { competitionId },
      include: {
        competitors: {
          where: { registrationStatus: { not: 'WITHDRAWN' } },
        },
        matches: true,
      },
      orderBy: [{ gender: 'asc' }, { ageGroup: 'asc' }, { minWeight: 'asc' }],
    });

    const result: CategoryStandings[] = [];

    for (const category of categories) {
      const competitorRefs = new Map<string, CompetitorRef>();
      for (const c of category.competitors) {
        competitorRefs.set(c.id, {
          id: c.id,
          firstName: c.firstName,
          lastName: c.lastName,
          club: c.club,
        });
      }

      const competitorIds = category.competitors.map((c) => c.id);
      const standingMatches: StandingMatch[] = category.matches.map((m) => ({
        competitor1Id: m.competitor1Id,
        competitor2Id: m.competitor2Id,
        winnerId: m.winnerId,
        winMethod: m.winMethod,
        status: m.status,
        round: m.round,
        poolPosition: m.poolPosition,
        scores: (m.scores as unknown as MatchScores) ?? null,
        phase: m.phase ?? null,
        poolGroup: m.poolGroup ?? null,
      }));

      if (category.bracketType === 'POOLS') {
        const result_ = computePoolsStandings(standingMatches);
        result.push({
          categoryId: category.id,
          categoryName: category.name,
          bracketType: 'POOLS',
          status: result_.status,
          standings: result_.standings.map((s) => ({
            rank: s.rank,
            competitor: competitorRefs.get(s.competitorId) ?? {
              id: s.competitorId,
              firstName: '',
              lastName: '',
              club: '',
            },
          })),
        });
        continue;
      }

      if (category.bracketType === 'ROUND_ROBIN') {
        const ranking = rankRoundRobin(competitorIds, standingMatches);
        const expected = expectedRoundRobinMatchCount(competitorIds.length);
        const complete = isRoundRobinComplete(expected, standingMatches);
        const tied = ranking.some((r) => r.tiedWith.length > 0);
        let status: CategoryStandings['status'] = 'IN_PROGRESS';
        if (complete) status = tied ? 'PENDING_PLAYOFF' : 'COMPLETE';

        result.push({
          categoryId: category.id,
          categoryName: category.name,
          bracketType: 'ROUND_ROBIN',
          status,
          standings: ranking.map((r) => ({
            rank: r.rank,
            competitor: competitorRefs.get(r.competitorId) ?? {
              id: r.competitorId,
              firstName: '',
              lastName: '',
              club: '',
            },
            wins: r.wins,
            losses: r.losses,
            ippons: r.ippons,
            wazaAriWins: r.wazaAriWins,
            shidosReceived: r.shidosReceived,
            tiedWith: r.tiedWith,
          })),
        });
      } else {
        const elim = computeEliminationStandings(competitorIds.length, standingMatches);
        result.push({
          categoryId: category.id,
          categoryName: category.name,
          bracketType: category.bracketType,
          status: elim.status,
          standings: elim.standings.map((s) => ({
            rank: s.rank,
            competitor: competitorRefs.get(s.competitorId) ?? {
              id: s.competitorId,
              firstName: '',
              lastName: '',
              club: '',
            },
          })),
        });
      }
    }

    return result;
  }
}
