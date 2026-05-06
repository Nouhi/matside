import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import * as express from 'express';
import { IsInt, IsString, Min } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MatService } from './mat.service';

class CreateMatsDto {
  @IsInt()
  @Min(1)
  count: number;
}

class AssignMatchDto {
  @IsString()
  matchId: string;
}

class VerifyPinDto {
  @IsString()
  pin: string;
}

@Controller()
export class MatController {
  constructor(private matService: MatService) {}

  @Post('competitions/:competitionId/mats')
  @UseGuards(JwtAuthGuard)
  create(
    @Param('competitionId') competitionId: string,
    @Body() dto: CreateMatsDto,
    @Req() req: express.Request,
  ) {
    return this.matService.createMats(competitionId, dto.count, (req.user as { sub: string }).sub);
  }

  @Get('competitions/:competitionId/mats')
  list(@Param('competitionId') competitionId: string) {
    return this.matService.getMats(competitionId);
  }

  @Patch('mats/:matId/assign')
  @UseGuards(JwtAuthGuard)
  assign(
    @Param('matId') matId: string,
    @Body() dto: AssignMatchDto,
    @Req() req: express.Request,
  ) {
    return this.matService.assignMatchToMat(matId, dto.matchId, (req.user as { sub: string }).sub);
  }

  @Post('mats/:matId/verify-pin')
  async verifyPin(
    @Param('matId') matId: string,
    @Body() dto: VerifyPinDto,
  ) {
    const valid = await this.matService.verifyPin(matId, dto.pin);
    return { valid };
  }
}
