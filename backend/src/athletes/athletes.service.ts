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
  licenseNumber?: string;
  dateOfBirth: Date;
  gender: Gender;
}

export interface AthleteProfile {
  id: string;
  firstName: string;
  lastName: string;
  gender: Gender;
  // License is publicly displayable identity (federation issues it
  // openly, like a USAJ membership number on a credential card). Email
  // and DOB stay out of the public profile.
  licenseNumber: string | null;
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
   * Auto-match by email first, then by license number, else create. Both
   * keys are unique on Athlete; we try email first because more registrants
   * have one. License is the more stable key in the long run (federation
   * IDs survive email/club changes), but coverage is uneven.
   *
   * If both email and license are provided AND each matches a *different*
   * Athlete, that's a real-world data conflict. We prefer the email match
   * and update the existing row's license to the new one — better than
   * creating a duplicate athlete the organizer would have to merge.
   *
   * Tx-aware: pass tx to participate in a parent transaction.
   */
  async findOrCreateForRegistration(
    input: RegistrationInput,
    tx?: Prisma.TransactionClient,
  ): Promise<Athlete> {
    const client = tx ?? this.prisma;
    const email = input.email && input.email.trim().length > 0 ? input.email.trim() : null;
    const licenseNumber =
      input.licenseNumber && input.licenseNumber.trim().length > 0
        ? input.licenseNumber.trim()
        : null;

    if (email) {
      const existing = await client.athlete.findUnique({ where: { email } });
      if (existing) {
        // Backfill licenseNumber if we now have one and the existing row doesn't.
        if (licenseNumber && !existing.licenseNumber) {
          return client.athlete.update({
            where: { id: existing.id },
            data: { licenseNumber },
          });
        }
        return existing;
      }
    }

    if (licenseNumber) {
      const existing = await client.athlete.findUnique({ where: { licenseNumber } });
      if (existing) {
        if (email && !existing.email) {
          return client.athlete.update({
            where: { id: existing.id },
            data: { email },
          });
        }
        return existing;
      }
    }

    return client.athlete.create({
      data: {
        firstName: input.firstName,
        lastName: input.lastName,
        dateOfBirth: input.dateOfBirth,
        gender: input.gender,
        email,
        licenseNumber,
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
      licenseNumber: athlete.licenseNumber,
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
