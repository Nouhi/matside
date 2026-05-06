import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type ScoreEventType = 'WAZA_ARI' | 'SHIDO' | 'OSAEKOMI_START' | 'OSAEKOMI_STOP';

export interface ScoreEvent {
  type: ScoreEventType;
  competitorId: string;
  timestamp: number;
}

export interface MatchScores {
  competitor1: { wazaAri: number; shido: number };
  competitor2: { wazaAri: number; shido: number };
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

    const scores: MatchScores = (match.scores as any) || {
      competitor1: { wazaAri: 0, shido: 0 },
      competitor2: { wazaAri: 0, shido: 0 },
    };

    const side = this.getCompetitorSide(match, event.competitorId);

    if (event.type === 'WAZA_ARI') {
      scores[side].wazaAri += 1;
    } else if (event.type === 'SHIDO') {
      scores[side].shido += 1;
    }

    let terminated = false;
    let winMethod: string | undefined;
    let winnerId: string | undefined;

    if (scores[side].wazaAri >= 2) {
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

    return { match: updated, terminated, winMethod, winnerId };
  }

  async startMatch(matchId: string) {
    const match = await this.prisma.match.findUnique({ where: { id: matchId } });
    if (!match) throw new NotFoundException('Match not found');
    if (match.status !== 'SCHEDULED') throw new BadRequestException('Match is not in SCHEDULED status');

    const scores: MatchScores = {
      competitor1: { wazaAri: 0, shido: 0 },
      competitor2: { wazaAri: 0, shido: 0 },
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

    return this.prisma.match.update({
      where: { id: matchId },
      data: {
        status: 'COMPLETED',
        winner: { connect: { id: winnerId } },
        winMethod: winMethod as any,
      },
      include: { competitor1: true, competitor2: true },
    });
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
}
