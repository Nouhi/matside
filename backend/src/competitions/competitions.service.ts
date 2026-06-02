import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CompetitionStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const VALID_TRANSITIONS: Record<string, string> = {
  DRAFT: 'REGISTRATION',
  REGISTRATION: 'WEIGH_IN',
  WEIGH_IN: 'ACTIVE',
  ACTIVE: 'COMPLETED',
};

@Injectable()
export class CompetitionsService {
  constructor(private prisma: PrismaService) {}

  create(organizerId: string, data: { name: string; date: Date; location?: string }) {
    return this.prisma.competition.create({
      data: {
        name: data.name,
        date: data.date,
        location: data.location ?? '',
        organizerId,
      },
    });
  }

  findAll(organizerId: string) {
    return this.prisma.competition.findMany({
      where: { organizerId },
      orderBy: { date: 'desc' },
    });
  }

  async findOne(id: string, organizerId: string) {
    const competition = await this.prisma.competition.findUnique({
      where: { id },
    });
    if (!competition) {
      throw new NotFoundException('Competition not found');
    }
    if (competition.organizerId !== organizerId) {
      throw new ForbiddenException();
    }
    return competition;
  }

  async update(
    id: string,
    organizerId: string,
    data: {
      name?: string;
      date?: Date;
      location?: string;
      status?: CompetitionStatus;
      maxEntriesPerCategory?: number | null;
    },
  ) {
    const competition = await this.findOne(id, organizerId);

    if (data.status) {
      const allowed = VALID_TRANSITIONS[competition.status];
      if (allowed !== data.status) {
        throw new BadRequestException('Invalid status transition');
      }
    }

    return this.prisma.competition.update({
      where: { id },
      data,
    });
  }

  async delete(id: string, organizerId: string) {
    await this.findOne(id, organizerId);
    return this.prisma.competition.delete({ where: { id } });
  }

  // --- Coach access management (PR3 organizer-gating) ----------------------

  /** Coaches the organizer has approved for this competition. */
  async listCoaches(competitionId: string, organizerId: string) {
    await this.findOne(competitionId, organizerId); // ownership gate
    const links = await this.prisma.competitionCoach.findMany({
      where: { competitionId },
      include: { coach: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return links.map((l) => ({
      coachUserId: l.coachUserId,
      name: l.coach.name,
      email: l.coach.email,
      addedAt: l.createdAt,
    }));
  }

  /**
   * Approve a coach for this competition by email. ENUMERATION-SAFE: returns
   * the same `{ added: boolean }` shape whether or not the email belongs to a
   * registered coach, so an organizer can't use this endpoint to probe which
   * emails have accounts. Only links an existing COACH-role user; a non-coach
   * or unknown email is silently a no-op (added: false). Idempotent — a
   * duplicate add is a no-op, not a 409.
   *
   * Note: this is response-shape enumeration-safe, not timing-safe — a real
   * coach email does an extra upsert write. The residual timing channel is only
   * reachable by an authenticated organizer acting on a competition they own
   * (the findOne gate runs first), so it's an accepted risk, not a leak.
   */
  async addCoach(competitionId: string, organizerId: string, email: string) {
    await this.findOne(competitionId, organizerId); // ownership gate
    // Emails are stored verbatim (case-sensitive unique), so an organizer typing
    // a different case than the coach signed up with would otherwise silently
    // fail to approve — and the enumeration-safe {added:false} response gives no
    // hint why. Match exactly first, then fall back to a case-insensitive lookup.
    let coach = await this.prisma.user.findUnique({ where: { email } });
    if (!coach) {
      coach = await this.prisma.user.findFirst({
        where: { email: { equals: email, mode: 'insensitive' } },
      });
    }
    if (!coach || coach.role !== UserRole.COACH) {
      // Enumeration-safe: identical outcome to "added but already linked".
      return { added: false };
    }
    await this.prisma.competitionCoach.upsert({
      where: {
        competitionId_coachUserId: { competitionId, coachUserId: coach.id },
      },
      create: { competitionId, coachUserId: coach.id },
      update: {},
    });
    return { added: true };
  }

  /** Revoke a coach's access. Past registrations (Competitor.registeredById) survive. */
  async removeCoach(competitionId: string, organizerId: string, coachUserId: string) {
    await this.findOne(competitionId, organizerId); // ownership gate
    await this.prisma.competitionCoach.deleteMany({
      where: { competitionId, coachUserId },
    });
    return { removed: true };
  }
}
