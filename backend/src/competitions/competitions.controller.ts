import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import * as express from 'express';
import { IsDateString, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { CompetitionStatus } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CompetitionsService } from './competitions.service';

export class CreateCompetitionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @IsDateString()
  date: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  location?: string;
}

export class UpdateCompetitionDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  location?: string;

  @IsOptional()
  @IsEnum(CompetitionStatus)
  status?: CompetitionStatus;
}

@Controller('competitions')
@UseGuards(JwtAuthGuard)
export class CompetitionsController {
  constructor(private competitionsService: CompetitionsService) {}

  @Post()
  create(@Req() req: express.Request, @Body() dto: CreateCompetitionDto) {
    const user = req.user as { sub: string; email: string };
    return this.competitionsService.create(user.sub, {
      name: dto.name,
      date: new Date(dto.date),
      location: dto.location,
    });
  }

  @Get()
  findAll(@Req() req: express.Request) {
    const user = req.user as { sub: string; email: string };
    return this.competitionsService.findAll(user.sub);
  }

  @Get(':id')
  findOne(@Req() req: express.Request, @Param('id') id: string) {
    const user = req.user as { sub: string; email: string };
    return this.competitionsService.findOne(id, user.sub);
  }

  @Patch(':id')
  update(
    @Req() req: express.Request,
    @Param('id') id: string,
    @Body() dto: UpdateCompetitionDto,
  ) {
    const user = req.user as { sub: string; email: string };
    return this.competitionsService.update(id, user.sub, {
      name: dto.name,
      date: dto.date ? new Date(dto.date) : undefined,
      location: dto.location,
      status: dto.status,
    });
  }

  @Delete(':id')
  delete(@Req() req: express.Request, @Param('id') id: string) {
    const user = req.user as { sub: string; email: string };
    return this.competitionsService.delete(id, user.sub);
  }
}
