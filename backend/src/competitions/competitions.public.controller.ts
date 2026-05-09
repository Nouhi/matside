import {
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { BracketsService } from '../brackets/brackets.service';
import { StandingsService } from '../standings/standings.service';

// Public spectator-facing endpoints. No auth, no PII, light cache headers
// so a spectator URL going viral on Instagram doesn't melt the API. Every
// endpoint is a sanitized projection of an existing organizer endpoint —
// strip pin, strip email, never expose anything an organizer wouldn't put
// on a printed bracket sheet.

const CACHE_HEADER = 'public, max-age=10, must-revalidate';

interface PublicCompetitor {
  id: string;
  firstName: string;
  lastName: string;
  club: string;
}

function sanitizeCompetitor(c: {
  id: string;
  firstName: string;
  lastName: string;
  club: string;
} | null | undefined): PublicCompetitor | null {
  if (!c) return null;
  return { id: c.id, firstName: c.firstName, lastName: c.lastName, club: c.club };
}

function etagFor(payload: unknown): string {
  // Weak ETag derived from the JSON body. Cheap, deterministic. We cap at
  // ~1MB of payload (anything bigger and weak hashing isn't the bottleneck).
  const hash = createHash('sha1').update(JSON.stringify(payload)).digest('hex').slice(0, 16);
  return `W/"${hash}"`;
}

function maybe304(req: Request, res: Response, etag: string): boolean {
  res.setHeader('Cache-Control', CACHE_HEADER);
  res.setHeader('ETag', etag);
  const incoming = req.header('if-none-match');
  if (incoming && incoming === etag) {
    res.status(304).end();
    return true;
  }
  return false;
}

@Controller('public/competitions')
export class PublicCompetitionsController {
  constructor(
    private prisma: PrismaService,
    private bracketsService: BracketsService,
    private standingsService: StandingsService,
  ) {}

  @Get(':id')
  @Header('Cache-Control', CACHE_HEADER)
  async findOne(
    @Param('id') id: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const competition = await this.prisma.competition.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        date: true,
        location: true,
        status: true,
        _count: { select: { competitors: true, categories: true, mats: true } },
      },
    });
    if (!competition) throw new NotFoundException('Competition not found');

    const payload = {
      ...competition,
      competitorCount: competition._count.competitors,
      categoryCount: competition._count.categories,
      matCount: competition._count.mats,
      _count: undefined,
    };
    const etag = etagFor(payload);
    if (maybe304(req, res, etag)) return;
    return payload;
  }

  @Get(':id/brackets')
  async getBrackets(
    @Param('id') id: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const competition = await this.prisma.competition.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!competition) throw new NotFoundException('Competition not found');

    // Reuse the organizer-facing service, then strip PII at the boundary.
    const categories = await this.bracketsService.getBrackets(id);
    const sanitized = categories.map((cat) => ({
      id: cat.id,
      name: cat.name,
      gender: cat.gender,
      ageGroup: cat.ageGroup,
      bracketType: cat.bracketType,
      minWeight: cat.minWeight,
      maxWeight: cat.maxWeight,
      competitors: cat.competitors.map(sanitizeCompetitor),
      matches: cat.matches.map((m) => ({
        id: m.id,
        round: m.round,
        poolPosition: m.poolPosition,
        sequenceNum: m.sequenceNum,
        status: m.status,
        winMethod: m.winMethod,
        phase: m.phase,
        poolGroup: m.poolGroup,
        scores: m.scores,
        competitor1: sanitizeCompetitor(m.competitor1),
        competitor2: sanitizeCompetitor(m.competitor2),
        winner: sanitizeCompetitor(m.winner),
      })),
    }));

    const etag = etagFor(sanitized);
    if (maybe304(req, res, etag)) return;
    return sanitized;
  }

  @Get(':id/schedule')
  async getSchedule(
    @Param('id') id: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const competition = await this.prisma.competition.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!competition) throw new NotFoundException('Competition not found');

    // Mats with current + upcoming queue. Strip pin (organizer-only secret)
    // and competitor email at the source via select so it never reaches
    // memory in a public response.
    const mats = await this.prisma.mat.findMany({
      where: { competitionId: id },
      orderBy: { number: 'asc' },
      select: {
        id: true,
        number: true,
        currentMatchId: true,
        categories: {
          select: { id: true, name: true, _count: { select: { competitors: true } } },
        },
      },
    });

    const enriched = await Promise.all(
      mats.map(async (mat) => {
        const currentMatch = mat.currentMatchId
          ? await this.prisma.match.findUnique({
              where: { id: mat.currentMatchId },
              select: {
                id: true,
                round: true,
                poolPosition: true,
                status: true,
                category: { select: { id: true, name: true } },
                competitor1: { select: { id: true, firstName: true, lastName: true, club: true } },
                competitor2: { select: { id: true, firstName: true, lastName: true, club: true } },
              },
            })
          : null;

        const nextMatches = await this.prisma.match.findMany({
          where: {
            matId: mat.id,
            status: 'SCHEDULED',
            competitor1Id: { not: null },
            competitor2Id: { not: null },
            id: mat.currentMatchId ? { not: mat.currentMatchId } : undefined,
          },
          orderBy: [{ categoryId: 'asc' }, { sequenceNum: 'asc' }],
          take: 8,
          select: {
            id: true,
            round: true,
            poolPosition: true,
            sequenceNum: true,
            category: { select: { id: true, name: true } },
            competitor1: { select: { id: true, firstName: true, lastName: true, club: true } },
            competitor2: { select: { id: true, firstName: true, lastName: true, club: true } },
          },
        });

        return {
          id: mat.id,
          number: mat.number,
          categories: mat.categories,
          currentMatch,
          nextMatches,
        };
      }),
    );

    const etag = etagFor(enriched);
    if (maybe304(req, res, etag)) return enriched;
    return enriched;
  }

  @Get(':id/standings')
  async getStandings(
    @Param('id') id: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const competition = await this.prisma.competition.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!competition) throw new NotFoundException('Competition not found');

    const standings = await this.standingsService.getCompetitionStandings(id);
    const etag = etagFor(standings);
    if (maybe304(req, res, etag)) return;
    return standings;
  }
}
