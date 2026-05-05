import {
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import * as express from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BracketsService } from './brackets.service';

@Controller('competitions/:competitionId/brackets')
@UseGuards(JwtAuthGuard)
export class BracketsController {
  constructor(private bracketsService: BracketsService) {}

  @Post('generate')
  generate(
    @Req() req: express.Request,
    @Param('competitionId') competitionId: string,
  ) {
    const user = req.user as { sub: string; email: string };
    return this.bracketsService.generateBrackets(competitionId, user.sub);
  }

  @Get()
  getBrackets(@Param('competitionId') competitionId: string) {
    return this.bracketsService.getBrackets(competitionId);
  }
}
