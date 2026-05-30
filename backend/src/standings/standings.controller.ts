import { Controller, Get, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { StandingsService } from './standings.service';

@Controller('competitions/:competitionId/standings')
export class StandingsController {
  constructor(private standingsService: StandingsService) {}

  @Get()
  getStandings(@Param('competitionId') competitionId: string) {
    return this.standingsService.getCompetitionStandings(competitionId);
  }

  @Get('export')
  async exportStandings(
    @Param('competitionId') competitionId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    const { filename, csv } =
      await this.standingsService.exportStandingsCsv(competitionId);
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    // Prepend a UTF-8 BOM (U+FEFF) so Excel renders accented competitor
    // names correctly when it opens the file.
    return '﻿' + csv;
  }
}
