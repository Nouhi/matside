import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { MatchPhase, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { getNextSlot } from '../brackets/single-repechage.util';
import { knockoutFormatFor } from '../brackets/pools.util';
import { rankRoundRobin } from '../standings/round-robin.util';
import { MatchScores as StandingMatchScores, StandingMatch } from '../standings/standings.types';

export type ScoreEventType = 'WAZA_ARI' | 'YUKO' | 'SHIDO' | 'IPPON';

export interface ScoreEvent {
  type: ScoreEventType;
  competitorId: string;
  timestamp: number;
}

export interface CompetitorScore {
  wazaAri: number;
  yuko: number;
  shido: number;
}

export interface MatchScores {
  competitor1: CompetitorScore;
  competitor2: CompetitorScore;
}

const EMPTY_SCORE: CompetitorScore = { wazaAri: 0, yuko: 0, shido: 0 };

function normalizeScores(raw: unknown): MatchScores {
  const scores = (raw ?? {}) as Partial<MatchScores>;
  return {
    competitor1: { ...EMPTY_SCORE, ...(scores.competitor1 ?? {}) },
    competitor2: { ...EMPTY_SCORE, ...(scores.competitor2 ?? {}) },
  };
}

interface ApplyResult {
  match: any;
  terminated: boolean;
  winMethod?: string;
  winnerId?: string;
}

@Injectable()
export class ScoreboardService {
  constructor(private prisma: PrismaService) {}

  async applyScoreEvent(matchId: string, event: ScoreEvent): Promise<ApplyResult> {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: { competitor1: true, competitor2: true },
    });
    if (!match) throw new NotFoundException('Match not found');
    if (match.status !== 'ACTIVE') throw new BadRequestException('Match is not active');

    const scores = normalizeScores(match.scores);

    const side = this.getCompetitorSide(match, event.competitorId);

    if (event.type === 'WAZA_ARI') {
      scores[side].wazaAri += 1;
    } else if (event.type === 'YUKO') {
      scores[side].yuko += 1;
    } else if (event.type === 'SHIDO') {
      scores[side].shido += 1;
    }

    let terminated = false;
    let winMethod: string | undefined;
    let winnerId: string | undefined;

    if (event.type === 'IPPON') {
      terminated = true;
      winMethod = 'IPPON';
      winnerId = event.competitorId;
    } else if (scores[side].wazaAri >= 2) {
      terminated = true;
      winMethod = 'IPPON';
      winnerId = event.competitorId;
    } else if (scores[side].shido >= 3) {
      terminated = true;
      winMethod = 'HANSOKU_MAKE';
      winnerId = side === 'competitor1' ? match.competitor2Id! : match.competitor1Id!;
    }

    const updateData: Prisma.MatchUpdateInput = { scores: scores as unknown as Prisma.InputJsonValue };
    if (terminated) {
      updateData.status = 'COMPLETED';
      updateData.winner = { connect: { id: winnerId } };
      updateData.winMethod = winMethod as any;
    }

    const updated = await this.prisma.match.update({
      where: { id: matchId },
      data: updateData,
      include: { competitor1: true, competitor2: true },
    });

    if (terminated && winnerId) {
      await this.advanceWinner(updated, winnerId);
    }

    return { match: updated, terminated, winMethod, winnerId };
  }

  async startMatch(matchId: string) {
    const match = await this.prisma.match.findUnique({ where: { id: matchId } });
    if (!match) throw new NotFoundException('Match not found');
    if (match.status !== 'SCHEDULED') throw new BadRequestException('Match is not in SCHEDULED status');

    const scores: MatchScores = {
      competitor1: { ...EMPTY_SCORE },
      competitor2: { ...EMPTY_SCORE },
    };

    return this.prisma.match.update({
      where: { id: matchId },
      data: { status: 'ACTIVE', scores: scores as unknown as Prisma.InputJsonValue },
      include: { competitor1: true, competitor2: true },
    });
  }

  async endMatch(matchId: string, winnerId: string, winMethod: string) {
    const match = await this.prisma.match.findUnique({ where: { id: matchId } });
    if (!match) throw new NotFoundException('Match not found');
    if (match.status !== 'ACTIVE') throw new BadRequestException('Match is not active');

    const updated = await this.prisma.match.update({
      where: { id: matchId },
      data: {
        status: 'COMPLETED',
        winner: { connect: { id: winnerId } },
        winMethod: winMethod as any,
      },
      include: { competitor1: true, competitor2: true },
    });

    await this.advanceWinner(updated, winnerId);

    return updated;
  }

  async getMatchState(matchId: string) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: { competitor1: true, competitor2: true, category: true },
    });
    if (!match) throw new NotFoundException('Match not found');
    return match;
  }

  async getMatState(matId: string) {
    const mat = await this.prisma.mat.findUnique({ where: { id: matId } });
    if (!mat) throw new NotFoundException('Mat not found');
    if (!mat.currentMatchId) return { mat, match: null };

    const match = await this.prisma.match.findUnique({
      where: { id: mat.currentMatchId },
      include: { competitor1: true, competitor2: true, category: true },
    });

    return { mat, match };
  }

  async enableGoldenScore(matchId: string) {
    const match = await this.prisma.match.findUnique({ where: { id: matchId } });
    if (!match) throw new NotFoundException('Match not found');
    if (match.status !== 'ACTIVE') throw new BadRequestException('Match is not active');

    return this.prisma.match.update({
      where: { id: matchId },
      data: { goldenScore: true },
      include: { competitor1: true, competitor2: true },
    });
  }

  private getCompetitorSide(match: any, competitorId: string): 'competitor1' | 'competitor2' {
    if (match.competitor1Id === competitorId) return 'competitor1';
    if (match.competitor2Id === competitorId) return 'competitor2';
    throw new BadRequestException('Competitor is not in this match');
  }

  private async advanceWinner(
    completedMatch: {
      id: string;
      categoryId: string;
      round: number;
      poolPosition: number;
      phase: MatchPhase | null;
      competitor1Id: string | null;
      competitor2Id: string | null;
    },
    winnerId: string,
  ): Promise<void> {
    const category = await this.prisma.category.findUnique({
      where: { id: completedMatch.categoryId },
    });
    if (!category) return;

    if (category.bracketType === 'ROUND_ROBIN') return;

    if (category.bracketType === 'POOLS') {
      await this.advanceWinnerInPools(completedMatch, winnerId);
      return;
    }

    // SINGLE_REPECHAGE / legacy: simple slot advancement
    const next = getNextSlot(completedMatch.round, completedMatch.poolPosition);
    const nextMatch = await this.prisma.match.findFirst({
      where: {
        categoryId: completedMatch.categoryId,
        round: next.round,
        poolPosition: next.position,
      },
    });
    if (!nextMatch) return;

    const updateData: Prisma.MatchUpdateInput = next.isCompetitor1
      ? { competitor1: { connect: { id: winnerId } } }
      : { competitor2: { connect: { id: winnerId } } };

    await this.prisma.match.update({
      where: { id: nextMatch.id },
      data: updateData,
    });
  }

  private async advanceWinnerInPools(
    completedMatch: {
      id: string;
      categoryId: string;
      phase: MatchPhase | null;
      poolPosition: number;
      competitor1Id: string | null;
      competitor2Id: string | null;
    },
    winnerId: string,
  ): Promise<void> {
    const phase = completedMatch.phase;
    const categoryId = completedMatch.categoryId;
    const loserId =
      completedMatch.competitor1Id === winnerId
        ? completedMatch.competitor2Id
        : completedMatch.competitor1Id;

    if (phase === MatchPhase.POOL) {
      await this.maybeCreateKnockoutMatchesAfterPoolStage(categoryId);
      return;
    }

    if (phase === MatchPhase.KNOCKOUT_SF) {
      // Winner advances to FINAL, loser goes to BRONZE.
      const finalMatch = await this.prisma.match.findFirst({
        where: { categoryId, phase: MatchPhase.KNOCKOUT_FINAL },
      });
      const bronzeMatch = await this.prisma.match.findFirst({
        where: { categoryId, phase: MatchPhase.KNOCKOUT_BRONZE },
      });
      // Determine slot side based on which SF this was (poolPosition 1 → comp1, 2 → comp2)
      const isFirstSlot = completedMatch.poolPosition === 1;

      if (finalMatch) {
        await this.prisma.match.update({
          where: { id: finalMatch.id },
          data: isFirstSlot
            ? { competitor1: { connect: { id: winnerId } } }
            : { competitor2: { connect: { id: winnerId } } },
        });
      }
      if (bronzeMatch && loserId) {
        await this.prisma.match.update({
          where: { id: bronzeMatch.id },
          data: isFirstSlot
            ? { competitor1: { connect: { id: loserId } } }
            : { competitor2: { connect: { id: loserId } } },
        });
      }
      return;
    }

    // KNOCKOUT_FINAL and KNOCKOUT_BRONZE are terminal — no further advancement.
  }

  /**
   * Called after every POOL match completion. If every POOL match in the
   * category is now COMPLETED, we know the pool stage is done and we can
   * create the knockout matches with real competitor IDs derived from the
   * pool standings.
   *
   * No-op if any pool match is still pending or if knockout matches already
   * exist (idempotent).
   */
  private async maybeCreateKnockoutMatchesAfterPoolStage(categoryId: string): Promise<void> {
    const poolMatches = await this.prisma.match.findMany({
      where: { categoryId, phase: MatchPhase.POOL },
    });
    if (poolMatches.length === 0) return;
    if (!poolMatches.every((m) => m.status === 'COMPLETED')) return;

    // Idempotency: skip if knockout matches were already created
    const existingKnockout = await this.prisma.match.findFirst({
      where: {
        categoryId,
        phase: { in: [MatchPhase.KNOCKOUT_SF, MatchPhase.KNOCKOUT_FINAL, MatchPhase.KNOCKOUT_BRONZE] },
      },
    });
    if (existingKnockout) return;

    // Compute pool standings for each pool group
    const poolGroups = Array.from(new Set(poolMatches.map((m) => m.poolGroup ?? '')));
    const standingsByPool = new Map<string, string[]>();  // poolGroup -> [1st, 2nd, 3rd, ...] competitorIds

    for (const group of poolGroups) {
      const groupMatches = poolMatches.filter((m) => m.poolGroup === group);
      const competitorSet = new Set<string>();
      for (const m of groupMatches) {
        if (m.competitor1Id) competitorSet.add(m.competitor1Id);
        if (m.competitor2Id) competitorSet.add(m.competitor2Id);
      }
      const competitorIds = Array.from(competitorSet);

      const standingMatches: StandingMatch[] = groupMatches.map((m) => ({
        competitor1Id: m.competitor1Id,
        competitor2Id: m.competitor2Id,
        winnerId: m.winnerId,
        winMethod: m.winMethod,
        status: m.status,
        round: m.round,
        poolPosition: m.poolPosition,
        scores: (m.scores as unknown as StandingMatchScores) ?? null,
      }));
      const ranked = rankRoundRobin(competitorIds, standingMatches);
      standingsByPool.set(group, ranked.map((r) => r.competitorId));
    }

    const competitorCount = poolMatches.reduce((set, m) => {
      if (m.competitor1Id) set.add(m.competitor1Id);
      if (m.competitor2Id) set.add(m.competitor2Id);
      return set;
    }, new Set<string>()).size;

    const format = knockoutFormatFor(competitorCount);

    const category = await this.prisma.category.findUnique({ where: { id: categoryId } });
    const duration = category ? 240 : 240;
    const competition = category
      ? await this.prisma.competition.findUnique({ where: { id: category.competitionId } })
      : null;
    const matchDuration = competition?.matchDuration ?? duration;

    const a1 = standingsByPool.get('A')?.[0] ?? null;
    const a2 = standingsByPool.get('A')?.[1] ?? null;
    const b1 = standingsByPool.get('B')?.[0] ?? null;
    const b2 = standingsByPool.get('B')?.[1] ?? null;

    let nextSeq = poolMatches.length;

    if (format === 'TWO_TEAM') {
      // 5-8 competitors: top 1 from each pool → final; 2nd from each → bronze
      await this.prisma.match.create({
        data: {
          categoryId,
          phase: MatchPhase.KNOCKOUT_FINAL,
          round: 100,
          poolPosition: 1,
          competitor1Id: a1,
          competitor2Id: b1,
          duration: matchDuration,
          sequenceNum: ++nextSeq,
        },
      });
      await this.prisma.match.create({
        data: {
          categoryId,
          phase: MatchPhase.KNOCKOUT_BRONZE,
          round: 100,
          poolPosition: 2,
          competitor1Id: a2,
          competitor2Id: b2,
          duration: matchDuration,
          sequenceNum: ++nextSeq,
        },
      });
    } else {
      // 9-15 competitors: top 2 from each pool → 4-team knockout
      // SF1: A1 vs B2 (poolPosition=1)
      // SF2: B1 vs A2 (poolPosition=2)
      await this.prisma.match.create({
        data: {
          categoryId,
          phase: MatchPhase.KNOCKOUT_SF,
          round: 99,
          poolPosition: 1,
          competitor1Id: a1,
          competitor2Id: b2,
          duration: matchDuration,
          sequenceNum: ++nextSeq,
        },
      });
      await this.prisma.match.create({
        data: {
          categoryId,
          phase: MatchPhase.KNOCKOUT_SF,
          round: 99,
          poolPosition: 2,
          competitor1Id: b1,
          competitor2Id: a2,
          duration: matchDuration,
          sequenceNum: ++nextSeq,
        },
      });
      // Final and bronze get filled in once SFs complete (advanceWinnerInPools above)
      await this.prisma.match.create({
        data: {
          categoryId,
          phase: MatchPhase.KNOCKOUT_FINAL,
          round: 100,
          poolPosition: 1,
          duration: matchDuration,
          sequenceNum: ++nextSeq,
        },
      });
      await this.prisma.match.create({
        data: {
          categoryId,
          phase: MatchPhase.KNOCKOUT_BRONZE,
          round: 100,
          poolPosition: 2,
          duration: matchDuration,
          sequenceNum: ++nextSeq,
        },
      });
    }
  }
}
