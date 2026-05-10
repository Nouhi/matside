import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// Computed-on-read scheduler.
//
// The eng review on the Smoothcomp roadmap explicitly chose this over a
// materialized ScheduledMatch table for matside's scale (≤500 matches per
// tournament). Reasoning: per-mat queue × avg duration is cheap to compute
// fresh on every read, and avoids the drift / re-computation problems of
// keeping a separate schedule in sync with bracket state.
//
// Cache layer below memoizes per-competition for 5 seconds so a viral
// spectator URL doesn't hit the DB on every refresh.

interface MatchEta {
  matchId: string;
  etaSeconds: number; // 0 means "now / currently fighting"
}

const CACHE_TTL_MS = 5_000;

@Injectable()
export class SchedulerService {
  constructor(private prisma: PrismaService) {}

  private cache = new Map<
    string,
    { computedAt: number; etas: Map<string, number> }
  >();

  async computeEtas(competitionId: string): Promise<Map<string, number>> {
    const cached = this.cache.get(competitionId);
    if (cached && Date.now() - cached.computedAt < CACHE_TTL_MS) {
      return cached.etas;
    }
    const etas = await this.computeEtasUncached(competitionId);
    this.cache.set(competitionId, { computedAt: Date.now(), etas });
    return etas;
  }

  // For each mat, walk the queue (ACTIVE first, then SCHEDULED in
  // sequenceNum order, only matches with both competitors set). Position 0
  // gets eta=0 ("now"); position N gets eta = N × matchDuration.
  //
  // Future iteration: derive matchDuration from completed matches' actual
  // durations per category. For now we use Competition.matchDuration as
  // the constant tick.
  private async computeEtasUncached(
    competitionId: string,
  ): Promise<Map<string, number>> {
    const competition = await this.prisma.competition.findUnique({
      where: { id: competitionId },
      select: { matchDuration: true },
    });
    if (!competition) return new Map();
    const tickSec = competition.matchDuration;

    const mats = await this.prisma.mat.findMany({
      where: { competitionId },
      select: { id: true },
    });

    const etas = new Map<string, number>();

    for (const mat of mats) {
      // Order: ACTIVE first (position 0), then SCHEDULED by (categoryId,
      // sequenceNum) which is the existing queue convention used by
      // mat.service.getMats and scoreboard.service.advanceMatQueue.
      const queue = await this.prisma.match.findMany({
        where: {
          matId: mat.id,
          status: { in: ['SCHEDULED', 'ACTIVE'] },
          competitor1Id: { not: null },
          competitor2Id: { not: null },
        },
        orderBy: [
          { status: 'desc' }, // ACTIVE > SCHEDULED alphabetically; ACTIVE first
          { categoryId: 'asc' },
          { sequenceNum: 'asc' },
        ],
        select: { id: true, status: true },
      });

      let position = 0;
      for (const m of queue) {
        if (m.status === 'ACTIVE') {
          etas.set(m.id, 0);
        } else {
          etas.set(m.id, position * tickSec);
        }
        position++;
      }
    }

    return etas;
  }

  // Surface for a single match (used by spectator endpoint to enrich match
  // payloads without re-computing per match).
  async getEta(competitionId: string, matchId: string): Promise<number | null> {
    const etas = await this.computeEtas(competitionId);
    return etas.get(matchId) ?? null;
  }

  // Test-only helper. Bypasses the cache.
  invalidateCache(competitionId?: string): void {
    if (competitionId) this.cache.delete(competitionId);
    else this.cache.clear();
  }
}
