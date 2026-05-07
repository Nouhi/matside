import { Controller, Get, Param } from '@nestjs/common';
import { StandingsService } from './standings.service';

@Controller('competitions/:competitionId/standings')
export class StandingsController {
  constructor(private standingsService: StandingsService) {}

  @Get()
  getStandings(@Param('competitionId') competitionId: string) {
    return this.standingsService.getCompetitionStandings(competitionId);
  }
}
