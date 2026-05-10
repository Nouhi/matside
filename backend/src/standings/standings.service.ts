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
  athleteId: string | null;
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
  bracketType: 'ROUND_ROBIN' | 'POOLS' | 'SINGLE_REPECHAGE' | 'DOUBLE_REPECHAGE' | 'GRAND_SLAM';
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
          athleteId: c.athleteId ?? null,
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
              athleteId: null,
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
              athleteId: null,
            },
            wins: r.wins,
            losses: r.losses,
            ippons: r.ippons,
            wazaAriWins: r.wazaAriWins,
            shidosReceived: r.shidosReceived,
            tiedWith: r.tiedWith,
          })),
        });
      } else if (category.bracketType === 'GRAND_SLAM') {
        const gs = computeGrandSlamStandings(standingMatches);
        result.push({
          categoryId: category.id,
          categoryName: category.name,
          bracketType: 'GRAND_SLAM',
          status: gs.status,
          standings: gs.standings.map((s) => ({
            rank: s.rank,
            competitor: competitorRefs.get(s.competitorId) ?? {
              id: s.competitorId,
              firstName: '',
              lastName: '',
              club: '',
              athleteId: null,
            },
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
              athleteId: null,
            },
          })),
        });
      }
    }

    return result;
  }
}

/**
 * Final standings for the IJF Grand Slam 4-pool format.
 *
 *   1st:  KNOCKOUT_FINAL winner
 *   2nd:  KNOCKOUT_FINAL loser
 *   3rd:  KNOCKOUT_BRONZE TOP winner + KNOCKOUT_BRONZE BOTTOM winner (2 medals)
 *   5th:  KNOCKOUT_BRONZE TOP loser + KNOCKOUT_BRONZE BOTTOM loser
 *   7th:  REPECHAGE TOP loser + REPECHAGE BOTTOM loser
 *
 * Pool quarterfinalist losers (those eliminated before the pool final) are
 * unranked — same as Olympic format. Status reports IN_PROGRESS until both
 * bronze fights are complete.
 */
function computeGrandSlamStandings(matches: StandingMatch[]): {
  status: 'IN_PROGRESS' | 'COMPLETE';
  standings: { rank: number; competitorId: string }[];
} {
  const standings: { rank: number; competitorId: string }[] = [];

  function loser(m: StandingMatch): string | null {
    if (!m.winnerId || !m.competitor1Id || !m.competitor2Id) return null;
    return m.winnerId === m.competitor1Id ? m.competitor2Id : m.competitor1Id;
  }

  const final = matches.find((m) => m.phase === 'KNOCKOUT_FINAL');
  const bronzeTop = matches.find(
    (m) => m.phase === 'KNOCKOUT_BRONZE' && m.poolGroup === 'TOP',
  );
  const bronzeBottom = matches.find(
    (m) => m.phase === 'KNOCKOUT_BRONZE' && m.poolGroup === 'BOTTOM',
  );
  const repTop = matches.find(
    (m) => m.phase === 'REPECHAGE' && m.poolGroup === 'TOP',
  );
  const repBottom = matches.find(
    (m) => m.phase === 'REPECHAGE' && m.poolGroup === 'BOTTOM',
  );

  // 1st & 2nd
  if (final?.status === 'COMPLETED' && final.winnerId) {
    standings.push({ rank: 1, competitorId: final.winnerId });
    const second = loser(final);
    if (second) standings.push({ rank: 2, competitorId: second });
  }

  // 3rd (two)
  for (const b of [bronzeTop, bronzeBottom]) {
    if (b?.status === 'COMPLETED' && b.winnerId) {
      standings.push({ rank: 3, competitorId: b.winnerId });
    }
  }

  // 5th (two)
  for (const b of [bronzeTop, bronzeBottom]) {
    if (b?.status === 'COMPLETED') {
      const l = loser(b);
      if (l) standings.push({ rank: 5, competitorId: l });
    }
  }

  // 7th (two)
  for (const r of [repTop, repBottom]) {
    if (r?.status === 'COMPLETED') {
      const l = loser(r);
      if (l) standings.push({ rank: 7, competitorId: l });
    }
  }

  const allBronzeDone =
    bronzeTop?.status === 'COMPLETED' && bronzeBottom?.status === 'COMPLETED';
  const status: 'IN_PROGRESS' | 'COMPLETE' = allBronzeDone ? 'COMPLETE' : 'IN_PROGRESS';

  return { status, standings };
}
