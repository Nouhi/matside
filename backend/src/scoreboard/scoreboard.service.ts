import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { MatchPhase, Prisma, WinMethod } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { getNextSlot } from '../brackets/single-repechage.util';
import { knockoutFormatFor } from '../brackets/pools.util';
import { halfFor, totalRoundsFor as drTotalRoundsFor } from '../brackets/double-repechage.util';
import { rankRoundRobin } from '../standings/round-robin.util';
import { StandingMatch } from '../standings/standings.types';
import { CompetitorScore, MatchScores } from './scoreboard.types';

export type { CompetitorScore, MatchScores };

export type ScoreEventType = 'WAZA_ARI' | 'YUKO' | 'SHIDO' | 'IPPON';

export interface ScoreEvent {
  type: ScoreEventType;
  competitorId: string;
  timestamp: number;
}

const EMPTY_SCORE: CompetitorScore = { wazaAri: 0, yuko: 0, shido: 0 };

function normalizeScores(raw: unknown): MatchScores {
  const scores = (raw ?? {}) as Partial<MatchScores>;
  return {
    competitor1: { ...EMPTY_SCORE, ...(scores.competitor1 ?? {}) },
    competitor2: { ...EMPTY_SCORE, ...(scores.competitor2 ?? {}) },
  };
}

// What Prisma actually returns for `match.update({ include: { competitor1, competitor2 }})`.
// Used as the shape of `ApplyResult.match` so callers (the gateway) can read
// `result.match.scores` etc. without `any`.
type MatchWithCompetitors = Prisma.MatchGetPayload<{
  include: { competitor1: true; competitor2: true };
}>;

interface ApplyResult {
  match: MatchWithCompetitors;
  terminated: boolean;
  winMethod?: WinMethod;
  winnerId?: string;
}

// Subset of PrismaClient that the transaction-scoped advancement helpers
// need. Both `this.prisma` (the full client) and `tx` (the interactive
// transaction client) satisfy this — the helpers only use the listed
// model accessors, so they work in either context.
type TxClient = Pick<Prisma.TransactionClient, 'match' | 'category' | 'competitor' | 'mat' | 'competition'>;

@Injectable()
export class ScoreboardService {
  constructor(private prisma: PrismaService) {}

  async applyScoreEvent(matchId: string, event: ScoreEvent): Promise<ApplyResult> {
    // Read the match outside the transaction. Holding a transaction open
    // across user/UI latency is wasteful; the score event itself is the
    // unit of work that needs atomicity, not the read-then-decide.
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
    let winMethod: WinMethod | undefined;
    let winnerId: string | undefined;

    if (event.type === 'IPPON') {
      terminated = true;
      winMethod = WinMethod.IPPON;
      winnerId = event.competitorId;
    } else if (scores[side].wazaAri >= 2) {
      terminated = true;
      winMethod = WinMethod.IPPON;
      winnerId = event.competitorId;
    } else if (scores[side].shido >= 3) {
      terminated = true;
      winMethod = WinMethod.HANSOKU_MAKE;
      winnerId = side === 'competitor1' ? match.competitor2Id! : match.competitor1Id!;
    }

    const updateData: Prisma.MatchUpdateInput = { scores: scores as unknown as Prisma.InputJsonValue };
    if (terminated) {
      updateData.status = 'COMPLETED';
      updateData.winner = { connect: { id: winnerId } };
      updateData.winMethod = winMethod;
    }

    // Atomicity boundary: the match update + (if terminated) bracket
    // advancement + mat queue advancement all commit together or roll
    // back together. A failure mid-advancement now leaves the match in
    // its prior state instead of writing a "match completed but bracket
    // not advanced" partial state that we'd have to repair by hand.
    //
    // CONCURRENCY NOTE: this transaction prevents PARTIAL writes within
    // one applyScoreEvent call. It does NOT serialize concurrent score
    // events (e.g., the osaekomi 20s setTimeout in scoreboard.gateway.ts
    // firing while a controller manually ends the match). Postgres
    // default isolation (READ COMMITTED) doesn't prevent that race.
    // Mitigation is tracked as ENG-A5 in TODOS.md.
    const updated = await this.prisma.$transaction(async (tx) => {
      const updatedMatch = await tx.match.update({
        where: { id: matchId },
        data: updateData,
        include: { competitor1: true, competitor2: true },
      });

      if (terminated && winnerId) {
        await this.advanceWinner(tx, updatedMatch, winnerId);
        if (updatedMatch.matId) {
          await this.advanceMatQueue(tx, updatedMatch.matId, updatedMatch.id);
        }
      }

      return updatedMatch;
    });

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

  async endMatch(matchId: string, winnerId: string, winMethod: WinMethod) {
    const match = await this.prisma.match.findUnique({ where: { id: matchId } });
    if (!match) throw new NotFoundException('Match not found');
    if (match.status !== 'ACTIVE') throw new BadRequestException('Match is not active');

    // Same atomicity boundary as applyScoreEvent — the match update plus
    // the downstream bracket/queue advancement either all commit or all
    // roll back. See ENG-A2 in TODOS.md for the design rationale.
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.match.update({
        where: { id: matchId },
        data: {
          status: 'COMPLETED',
          winner: { connect: { id: winnerId } },
          winMethod,
        },
        include: { competitor1: true, competitor2: true },
      });

      await this.advanceWinner(tx, updated, winnerId);
      if (updated.matId) await this.advanceMatQueue(tx, updated.matId, updated.id);

      return updated;
    });
  }

  /**
   * After a match completes, if it was the current match on its mat, swap
   * Mat.currentMatchId to the next ready match in the queue. "Ready" means
   * status=SCHEDULED, both competitors set, on the same mat. Order is by
   * (categoryId, sequenceNum) so a category's matches run consecutively.
   *
   * No-op if the completed match wasn't the current one (manual override
   * scenario), or if the queue is empty.
   */
  private async advanceMatQueue(tx: TxClient, matId: string, completedMatchId: string): Promise<void> {
    const mat = await tx.mat.findUnique({ where: { id: matId } });
    if (!mat) return;
    if (mat.currentMatchId !== completedMatchId) return;

    const next = await tx.match.findFirst({
      where: {
        matId,
        status: 'SCHEDULED',
        competitor1Id: { not: null },
        competitor2Id: { not: null },
        id: { not: completedMatchId },
      },
      orderBy: [{ categoryId: 'asc' }, { sequenceNum: 'asc' }],
    });

    await tx.mat.update({
      where: { id: matId },
      data: { currentMatchId: next?.id ?? null },
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

  /*
   * advanceWinner — bracket state machine after a match completes.
   *
   *   ┌──────────────┐
   *   │ completed    │
   *   │ match.phase  │
   *   └──────┬───────┘
   *          │
   *          ▼ category.bracketType
   *   ┌──────────────────────────────────────────────────────────────┐
   *   │ ROUND_ROBIN          → no advancement (standings only)        │
   *   │ SINGLE_REPECHAGE     → next.position via getNextSlot          │
   *   │ POOLS                → advanceWinnerInPools                   │
   *   │   ├─ POOL (any round)         → pool standings → create KO    │
   *   │   ├─ KNOCKOUT_SF              → winner → FINAL, loser → BRONZE│
   *   │   └─ KNOCKOUT_FINAL / BRONZE  → terminal                      │
   *   │ DOUBLE_REPECHAGE     → advanceWinnerInDoubleRepechage         │
   *   │   ├─ main R1..(QF-1)          → next slot                     │
   *   │   ├─ QF                       → winner→SF; loser→repechage    │
   *   │   ├─ SF                       → winner→FINAL; loser→bronze    │
   *   │   ├─ REPECHAGE                → winner→bronze comp1           │
   *   │   └─ KNOCKOUT_BRONZE / FINAL  → terminal                      │
   *   │ GRAND_SLAM           → advanceWinnerInGrandSlam               │
   *   │   ├─ POOL (non-final)         → next slot within pool         │
   *   │   ├─ POOL final               → winner→SF; loser→same-half REP│
   *   │   ├─ KNOCKOUT_SF              → winner→FINAL; loser→cross-half│
   *   │   │                              BRONZE (slot 2)              │
   *   │   ├─ REPECHAGE                → winner→same-half BRONZE slot 1│
   *   │   └─ KNOCKOUT_FINAL / BRONZE  → terminal                      │
   *   └──────────────────────────────────────────────────────────────┘
   *
   * All writes here run inside the transaction passed in `tx`. The caller
   * (applyScoreEvent / endMatch) holds the boundary; this function and its
   * helpers must NEVER reach for `this.prisma` directly — that would leak
   * a non-transactional write and break atomicity.
   */
  private async advanceWinner(
    tx: TxClient,
    completedMatch: {
      id: string;
      categoryId: string;
      round: number;
      poolPosition: number;
      phase: MatchPhase | null;
      poolGroup: string | null;
      competitor1Id: string | null;
      competitor2Id: string | null;
    },
    winnerId: string,
  ): Promise<void> {
    const category = await tx.category.findUnique({
      where: { id: completedMatch.categoryId },
    });
    if (!category) return;

    if (category.bracketType === 'ROUND_ROBIN') return;

    if (category.bracketType === 'POOLS') {
      await this.advanceWinnerInPools(tx, completedMatch, winnerId);
      return;
    }

    if (category.bracketType === 'DOUBLE_REPECHAGE') {
      await this.advanceWinnerInDoubleRepechage(tx, completedMatch, winnerId);
      return;
    }

    if (category.bracketType === 'GRAND_SLAM') {
      await this.advanceWinnerInGrandSlam(tx, completedMatch, winnerId);
      return;
    }

    // SINGLE_REPECHAGE / legacy: simple slot advancement
    const next = getNextSlot(completedMatch.round, completedMatch.poolPosition);
    const nextMatch = await tx.match.findFirst({
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

    await tx.match.update({
      where: { id: nextMatch.id },
      data: updateData,
    });
  }

  /**
   * DOUBLE_REPECHAGE bracket advancement (16+ competitors).
   *
   * Phase routing:
   *   - Main bracket R1..(QF-1): winner advances via getNextSlot. Loser eliminated.
   *   - QF (round = totalRounds-2): winner → SF. Loser → repechage of same half.
   *   - SF (round = totalRounds-1): winner → Final. Loser → bronze of same half.
   *   - REPECHAGE: winner → bronze of same half (as competitor1; SF loser is competitor2).
   *   - KNOCKOUT_BRONZE / Final: terminal.
   */
  private async advanceWinnerInDoubleRepechage(
    tx: TxClient,
    completedMatch: {
      id: string;
      categoryId: string;
      round: number;
      poolPosition: number;
      phase: MatchPhase | null;
      poolGroup: string | null;
      competitor1Id: string | null;
      competitor2Id: string | null;
    },
    winnerId: string,
  ): Promise<void> {
    const categoryId = completedMatch.categoryId;
    const loserId =
      completedMatch.competitor1Id === winnerId
        ? completedMatch.competitor2Id
        : completedMatch.competitor1Id;

    // Repechage: winner goes to bronze of same half (competitor1 slot).
    if (completedMatch.phase === MatchPhase.REPECHAGE) {
      const half = completedMatch.poolGroup;
      if (!half) return;
      const bronze = await tx.match.findFirst({
        where: { categoryId, phase: MatchPhase.KNOCKOUT_BRONZE, poolGroup: half },
      });
      if (!bronze) return;
      await tx.match.update({
        where: { id: bronze.id },
        data: { competitor1: { connect: { id: winnerId } } },
      });
      return;
    }

    // Bronze and any unrecognised phase: terminal
    if (completedMatch.phase === MatchPhase.KNOCKOUT_BRONZE) return;

    // Main bracket: figure out which round this is (by counting competitors)
    const competitors = await tx.competitor.count({
      where: { categoryId, registrationStatus: { not: 'WITHDRAWN' } },
    });
    const totalRounds = drTotalRoundsFor(competitors);
    const isQF = completedMatch.round === totalRounds - 2;
    const isSF = completedMatch.round === totalRounds - 1;

    // Always advance the winner to the next main-bracket slot.
    const next = getNextSlot(completedMatch.round, completedMatch.poolPosition);
    const nextMatch = await tx.match.findFirst({
      where: {
        categoryId,
        round: next.round,
        poolPosition: next.position,
        phase: null,
      },
    });
    if (nextMatch) {
      const updateData: Prisma.MatchUpdateInput = next.isCompetitor1
        ? { competitor1: { connect: { id: winnerId } } }
        : { competitor2: { connect: { id: winnerId } } };
      await tx.match.update({ where: { id: nextMatch.id }, data: updateData });
    }

    // QF loser → repechage of same half
    if (isQF && loserId) {
      const half = halfFor(completedMatch.round, completedMatch.poolPosition, totalRounds);
      const rep = await tx.match.findFirst({
        where: { categoryId, phase: MatchPhase.REPECHAGE, poolGroup: half },
      });
      if (rep) {
        // Two QF losers feed each repechage. First arrival → competitor1, second → competitor2.
        const slot: Prisma.MatchUpdateInput = rep.competitor1Id === null
          ? { competitor1: { connect: { id: loserId } } }
          : { competitor2: { connect: { id: loserId } } };
        await tx.match.update({ where: { id: rep.id }, data: slot });
      }
    }

    // SF loser → bronze of same half (as competitor2; repechage winner is competitor1)
    if (isSF && loserId) {
      const half = halfFor(completedMatch.round, completedMatch.poolPosition, totalRounds);
      const bronze = await tx.match.findFirst({
        where: { categoryId, phase: MatchPhase.KNOCKOUT_BRONZE, poolGroup: half },
      });
      if (bronze) {
        await tx.match.update({
          where: { id: bronze.id },
          data: { competitor2: { connect: { id: loserId } } },
        });
      }
    }
  }

  private async advanceWinnerInPools(
    tx: TxClient,
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
      await this.maybeCreateKnockoutMatchesAfterPoolStage(tx, categoryId);
      return;
    }

    if (phase === MatchPhase.KNOCKOUT_SF) {
      // Winner advances to FINAL, loser goes to BRONZE.
      const finalMatch = await tx.match.findFirst({
        where: { categoryId, phase: MatchPhase.KNOCKOUT_FINAL },
      });
      const bronzeMatch = await tx.match.findFirst({
        where: { categoryId, phase: MatchPhase.KNOCKOUT_BRONZE },
      });
      // Determine slot side based on which SF this was (poolPosition 1 → comp1, 2 → comp2)
      const isFirstSlot = completedMatch.poolPosition === 1;

      if (finalMatch) {
        await tx.match.update({
          where: { id: finalMatch.id },
          data: isFirstSlot
            ? { competitor1: { connect: { id: winnerId } } }
            : { competitor2: { connect: { id: winnerId } } },
        });
      }
      if (bronzeMatch && loserId) {
        await tx.match.update({
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
   * Grand Slam (4-pool) bracket advancement.
   *
   * Routing:
   *   POOL phase:
   *     - Within a pool, single-elim. Winner advances via getNextSlot.
   *     - The pool FINAL is the last round in that pool. Its winner goes
   *       into the main SF (Pool A/B → SF1, Pool C/D → SF2; Pool A/C
   *       become competitor1, Pool B/D become competitor2). Its loser
   *       goes into the same-half repechage (Pool A/C → REP TOP comp1,
   *       Pool B/D → REP BOTTOM comp1 / TOP comp2 etc.).
   *
   *   KNOCKOUT_SF:
   *     - Winner → FINAL.
   *     - Loser → BRONZE of OPPOSITE half (cross-half pairing). Goes into
   *       competitor2 because competitor1 will be the repechage winner.
   *
   *   REPECHAGE:
   *     - Winner → BRONZE of SAME half, competitor1.
   *
   *   KNOCKOUT_FINAL / KNOCKOUT_BRONZE: terminal.
   */
  private async advanceWinnerInGrandSlam(
    tx: TxClient,
    completedMatch: {
      id: string;
      categoryId: string;
      round: number;
      poolPosition: number;
      phase: MatchPhase | null;
      poolGroup: string | null;
      competitor1Id: string | null;
      competitor2Id: string | null;
    },
    winnerId: string,
  ): Promise<void> {
    const categoryId = completedMatch.categoryId;
    const phase = completedMatch.phase;
    const loserId =
      completedMatch.competitor1Id === winnerId
        ? completedMatch.competitor2Id
        : completedMatch.competitor1Id;

    if (phase === MatchPhase.POOL) {
      // Find this pool's max round to detect "is this the pool final?"
      const poolMaxRound = await tx.match.findFirst({
        where: { categoryId, phase: MatchPhase.POOL, poolGroup: completedMatch.poolGroup },
        orderBy: { round: 'desc' },
        select: { round: true },
      });
      const isPoolFinal =
        poolMaxRound != null && completedMatch.round === poolMaxRound.round;

      if (!isPoolFinal) {
        // Internal pool advancement.
        const next = getNextSlot(completedMatch.round, completedMatch.poolPosition);
        const nextMatch = await tx.match.findFirst({
          where: {
            categoryId,
            phase: MatchPhase.POOL,
            poolGroup: completedMatch.poolGroup,
            round: next.round,
            poolPosition: next.position,
          },
        });
        if (nextMatch) {
          await tx.match.update({
            where: { id: nextMatch.id },
            data: next.isCompetitor1
              ? { competitor1: { connect: { id: winnerId } } }
              : { competitor2: { connect: { id: winnerId } } },
          });
        }
        return;
      }

      // Pool final completed. Winner → main SF, loser → same-half repechage.
      const pool = completedMatch.poolGroup; // 'A' | 'B' | 'C' | 'D'
      // Pool A/B → SF1 (top half); C/D → SF2 (bottom half).
      const sfPosition = pool === 'A' || pool === 'B' ? 1 : 2;
      // Pool A/C → competitor1 of their SF; Pool B/D → competitor2.
      const sfIsC1 = pool === 'A' || pool === 'C';
      // Pool A/B feed REP TOP; Pool C/D feed REP BOTTOM.
      const repHalf = pool === 'A' || pool === 'B' ? 'TOP' : 'BOTTOM';
      // Pool A/C → competitor1 of repechage; Pool B/D → competitor2.
      const repIsC1 = pool === 'A' || pool === 'C';

      const sfMatch = await tx.match.findFirst({
        where: { categoryId, phase: MatchPhase.KNOCKOUT_SF, poolPosition: sfPosition },
      });
      if (sfMatch) {
        await tx.match.update({
          where: { id: sfMatch.id },
          data: sfIsC1
            ? { competitor1: { connect: { id: winnerId } } }
            : { competitor2: { connect: { id: winnerId } } },
        });
      }

      if (loserId) {
        const repMatch = await tx.match.findFirst({
          where: { categoryId, phase: MatchPhase.REPECHAGE, poolGroup: repHalf },
        });
        if (repMatch) {
          await tx.match.update({
            where: { id: repMatch.id },
            data: repIsC1
              ? { competitor1: { connect: { id: loserId } } }
              : { competitor2: { connect: { id: loserId } } },
          });
        }
      }
      return;
    }

    if (phase === MatchPhase.KNOCKOUT_SF) {
      // Winner → FINAL. Loser → BRONZE of OPPOSITE half (cross-half), as
      // competitor2 (competitor1 is reserved for the repechage winner).
      const isFirstSlot = completedMatch.poolPosition === 1; // SF1 = top half winner
      const finalMatch = await tx.match.findFirst({
        where: { categoryId, phase: MatchPhase.KNOCKOUT_FINAL },
      });
      if (finalMatch) {
        await tx.match.update({
          where: { id: finalMatch.id },
          data: isFirstSlot
            ? { competitor1: { connect: { id: winnerId } } }
            : { competitor2: { connect: { id: winnerId } } },
        });
      }

      if (loserId) {
        // SF1 (top) loser → BRONZE BOTTOM. SF2 (bottom) loser → BRONZE TOP.
        const oppositeHalf = isFirstSlot ? 'BOTTOM' : 'TOP';
        const bronzeMatch = await tx.match.findFirst({
          where: {
            categoryId,
            phase: MatchPhase.KNOCKOUT_BRONZE,
            poolGroup: oppositeHalf,
          },
        });
        if (bronzeMatch) {
          await tx.match.update({
            where: { id: bronzeMatch.id },
            data: { competitor2: { connect: { id: loserId } } },
          });
        }
      }
      return;
    }

    if (phase === MatchPhase.REPECHAGE) {
      // Repechage winner → BRONZE of SAME half, competitor1.
      const half = completedMatch.poolGroup; // 'TOP' | 'BOTTOM'
      const bronzeMatch = await tx.match.findFirst({
        where: { categoryId, phase: MatchPhase.KNOCKOUT_BRONZE, poolGroup: half },
      });
      if (bronzeMatch) {
        await tx.match.update({
          where: { id: bronzeMatch.id },
          data: { competitor1: { connect: { id: winnerId } } },
        });
      }
      return;
    }

    // KNOCKOUT_FINAL / KNOCKOUT_BRONZE are terminal.
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
  private async maybeCreateKnockoutMatchesAfterPoolStage(tx: TxClient, categoryId: string): Promise<void> {
    const poolMatches = await tx.match.findMany({
      where: { categoryId, phase: MatchPhase.POOL },
    });
    if (poolMatches.length === 0) return;
    if (!poolMatches.every((m) => m.status === 'COMPLETED')) return;

    // Idempotency: skip if knockout matches were already created
    const existingKnockout = await tx.match.findFirst({
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
        // m.scores is the canonical MatchScores shape — see scoreboard.types.ts.
        // Cast is needed because Prisma JSON columns return `JsonValue`.
        scores: (m.scores as unknown as MatchScores) ?? null,
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

    const category = await tx.category.findUnique({ where: { id: categoryId } });
    const duration = category ? 240 : 240;
    const competition = category
      ? await tx.competition.findUnique({ where: { id: category.competitionId } })
      : null;
    const matchDuration = competition?.matchDuration ?? duration;

    const a1 = standingsByPool.get('A')?.[0] ?? null;
    const a2 = standingsByPool.get('A')?.[1] ?? null;
    const b1 = standingsByPool.get('B')?.[0] ?? null;
    const b2 = standingsByPool.get('B')?.[1] ?? null;

    let nextSeq = poolMatches.length;

    if (format === 'TWO_TEAM') {
      // 5-8 competitors: top 1 from each pool → final; 2nd from each → bronze
      await tx.match.create({
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
      await tx.match.create({
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
      await tx.match.create({
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
      await tx.match.create({
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
      await tx.match.create({
        data: {
          categoryId,
          phase: MatchPhase.KNOCKOUT_FINAL,
          round: 100,
          poolPosition: 1,
          duration: matchDuration,
          sequenceNum: ++nextSeq,
        },
      });
      await tx.match.create({
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
