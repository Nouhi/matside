import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import type { AuthRequest } from '../auth/types';
import { CompetitorsService } from './competitors.service';
import { RegisterCompetitorDto } from './competitors.controller';

/**
 * Coach-scoped competitor operations. @Roles(COACH) at the class level — every
 * route requires a COACH token (organizers use the per-competition controller).
 * The coach acts on athletes they personally registered: register sets
 * registeredById to the coach's own id; my-athletes and withdraw are
 * ownership-scoped to that same id in the service layer.
 *
 * PR2 (thin wedge): a coach can register into ANY competition that is open for
 * registration — the same trust level as the public self-registration link.
 * PR3 will gate this to organizer-approved competitions (CompetitionCoach link).
 */
@Roles(UserRole.COACH)
@Controller('coach')
export class CoachCompetitorsController {
  constructor(private competitorsService: CompetitorsService) {}

  @Post('competitions/:competitionId/competitors')
  register(
    @Req() req: AuthRequest,
    @Param('competitionId') competitionId: string,
    @Body() dto: RegisterCompetitorDto,
  ) {
    return this.competitorsService.register(
      competitionId,
      {
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
        dateOfBirth: new Date(dto.dateOfBirth),
        gender: dto.gender,
        weight: dto.weight,
        club: dto.club,
        licenseNumber: dto.licenseNumber,
      },
      { registeredById: req.user.sub },
    );
  }

  @Get('athletes')
  myAthletes(@Req() req: AuthRequest) {
    return this.competitorsService.findMyAthletes(req.user.sub);
  }

  @Patch('competitors/:id/withdraw')
  withdraw(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.competitorsService.withdrawAsCoach(id, req.user.sub);
  }
}
