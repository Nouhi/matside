import { Injectable, NotFoundException } from '@nestjs/common';
import type { Athlete, Gender, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

// Athletes are persistent identities across tournaments. The auto-match
// rule is intentionally narrow: link only on a non-empty email. Anything
// fancier (DOB+name fuzzy matching, club + name) creates merge ambiguity
// the organizer has to clean up later. Better to err on creating a fresh
// row that someone can manually merge.

interface RegistrationInput {
  firstName: string;
  lastName: string;
  email: string;
  dateOfBirth: Date;
  gender: Gender;
}

export interface AthleteProfile {
  id: string;
  firstName: string;
  lastName: string;
  gender: Gender;
  competitions: AthleteCompetitionEntry[];
  lifetime: {
    competitionsEntered: number;
    matchesPlayed: number;
    wins: number;
    losses: number;
    ippons: number;
  };
}

export interface AthleteCompetitionEntry {
  competitorId: string;
  competition: {
    id: string;
    name: string;
    date: Date;
    location: string;
    status: string;
  };
  category: { id: string; name: string } | null;
  club: string;
  belt: string;
  weight: number | null;
  registrationStatus: string;
  matches: { played: number; won: number; lost: number };
}

@Injectable()
export class AthletesService {
  constructor(private prisma: PrismaService) {}

  /**
   * Auto-match by email when present, else create a new athlete row. Called
   * inline from competitor registration. Caller is responsible for tx safety.
   *
   * Tx-aware: pass tx to participate in a parent transaction; otherwise
   * uses the bare prisma client.
   */
  async findOrCreateForRegistration(
    input: RegistrationInput,
    tx?: Prisma.TransactionClient,
  ): Promise<Athlete> {
    const client = tx ?? this.prisma;
    const email = input.email && input.email.trim().length > 0 ? input.email.trim() : null;

    if (email) {
      const existing = await client.athlete.findUnique({ where: { email } });
      if (existing) return existing;
    }

    return client.athlete.create({
      data: {
        firstName: input.firstName,
        lastName: input.lastName,
        dateOfBirth: input.dateOfBirth,
        gender: input.gender,
        email,
      },
    });
  }

  /**
   * Public-safe profile read. Returns lifetime stats + per-competition
   * history. Strips email, dateOfBirth, registrationStatus details below
   * the level we want a casual visitor to see. Organizer-grade detail is
   * a separate concern (covered by the existing competitor endpoints).
   */
  async getProfile(id: string): Promise<AthleteProfile> {
    const athlete = await this.prisma.athlete.findUnique({
      where: { id },
      include: {
        competitors: {
          include: {
            competition: {
              select: { id: true, name: true, date: true, location: true, status: true },
            },
            category: { select: { id: true, name: true } },
            matchesAsCompetitor1: {
              select: { id: true, status: true, winnerId: true, winMethod: true },
            },
            matchesAsCompetitor2: {
              select: { id: true, status: true, winnerId: true, winMethod: true },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!athlete) throw new NotFoundException('Athlete not found');

    const competitions: AthleteCompetitionEntry[] = [];
    let totalPlayed = 0;
    let totalWins = 0;
    let totalLosses = 0;
    let totalIppons = 0;

    for (const c of athlete.competitors) {
      const allMatches = [...c.matchesAsCompetitor1, ...c.matchesAsCompetitor2];
      const completed = allMatches.filter((m) => m.status === 'COMPLETED');
      const won = completed.filter((m) => m.winnerId === c.id);
      const lost = completed.filter((m) => m.winnerId !== c.id && m.winnerId != null);
      const ippons = won.filter((m) => m.winMethod === 'IPPON').length;

      totalPlayed += completed.length;
      totalWins += won.length;
      totalLosses += lost.length;
      totalIppons += ippons;

      competitions.push({
        competitorId: c.id,
        competition: c.competition,
        category: c.category,
        club: c.club,
        belt: c.belt,
        weight: c.weight ? Number(c.weight) : null,
        registrationStatus: c.registrationStatus,
        matches: {
          played: completed.length,
          won: won.length,
          lost: lost.length,
        },
      });
    }

    return {
      id: athlete.id,
      firstName: athlete.firstName,
      lastName: athlete.lastName,
      gender: athlete.gender,
      competitions,
      lifetime: {
        competitionsEntered: competitions.length,
        matchesPlayed: totalPlayed,
        wins: totalWins,
        losses: totalLosses,
        ippons: totalIppons,
      },
    };
  }

  /**
   * One-time backfill: for every competitor without an athleteId, find or
   * create the appropriate athlete and link. Idempotent — re-running it
   * does nothing for already-linked rows. Run via `npm run backfill:athletes`.
   */
  async backfillAthletes(): Promise<{ linked: number; created: number; skipped: number }> {
    const orphans = await this.prisma.competitor.findMany({
      where: { athleteId: null },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        dateOfBirth: true,
        gender: true,
      },
    });

    let linked = 0;
    let created = 0;
    let skipped = 0;

    for (const c of orphans) {
      try {
        // Track if we hit an existing athlete vs. created a new one.
        const email = c.email && c.email.trim().length > 0 ? c.email.trim() : null;
        const existing = email
          ? await this.prisma.athlete.findUnique({ where: { email } })
          : null;

        const athlete = existing
          ? existing
          : await this.prisma.athlete.create({
              data: {
                firstName: c.firstName,
                lastName: c.lastName,
                dateOfBirth: c.dateOfBirth,
                gender: c.gender,
                email,
              },
            });

        await this.prisma.competitor.update({
          where: { id: c.id },
          data: { athleteId: athlete.id },
        });

        if (existing) linked++;
        else created++;
      } catch {
        skipped++;
      }
    }

    return { linked, created, skipped };
  }
}
