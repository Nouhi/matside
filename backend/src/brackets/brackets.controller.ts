import { Controller, Get, Param, Post, Req } from '@nestjs/common';
import * as express from 'express';
import { UserRole } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import { Public } from '../auth/public.decorator';
import { BracketsService } from './brackets.service';

@Controller('competitions/:competitionId/brackets')
export class BracketsController {
  constructor(private bracketsService: BracketsService) {}

  @Post('generate')
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  generate(
    @Req() req: express.Request,
    @Param('competitionId') competitionId: string,
  ) {
    const user = req.user as { sub: string; email: string };
    return this.bracketsService.generateBrackets(competitionId, user.sub);
  }

  // Public: spectators view brackets.
  @Public()
  @Get()
  getBrackets(@Param('competitionId') competitionId: string) {
    return this.bracketsService.getBrackets(competitionId);
  }
}
