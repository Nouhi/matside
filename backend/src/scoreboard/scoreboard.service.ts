import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { getNextSlot } from '../brackets/single-repechage.util';

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
    completedMatch: { id: string; categoryId: string; round: number; poolPosition: number },
    winnerId: string,
  ): Promise<void> {
    const category = await this.prisma.category.findUnique({
      where: { id: completedMatch.categoryId },
    });
    if (!category || category.bracketType === 'ROUND_ROBIN') return;

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
}
