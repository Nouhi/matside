import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import * as express from 'express';
import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Gender, RegistrationStatus, UserRole } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import { Public } from '../auth/public.decorator';
import { CompetitorsService } from './competitors.service';

export class RegisterCompetitorDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(100)
  email?: string;

  @IsDateString()
  dateOfBirth: string;

  @IsEnum(Gender)
  gender: Gender;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(500)
  weight?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  club?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  licenseNumber?: string;
}

export class UpdateStatusDto {
  @IsEnum(RegistrationStatus)
  status: RegistrationStatus;
}

export class UpdateWeightDto {
  @IsNumber()
  @Min(1)
  @Max(500)
  weight: number;
}

@Controller('competitions/:competitionId/competitors')
export class CompetitorsController {
  constructor(private competitorsService: CompetitorsService) {}

  // Public: competitor self-registration via the organizer's shared link.
  @Public()
  @Post()
  register(
    @Param('competitionId') competitionId: string,
    @Body() dto: RegisterCompetitorDto,
  ) {
    return this.competitorsService.register(competitionId, {
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      dateOfBirth: new Date(dto.dateOfBirth),
      gender: dto.gender,
      weight: dto.weight,
      club: dto.club,
      licenseNumber: dto.licenseNumber,
    });
  }

  // Public: the spectator/registration pages list competitors.
  @Public()
  @Get()
  findAll(@Param('competitionId') competitionId: string) {
    return this.competitorsService.findAll(competitionId);
  }

  @Patch(':id/status')
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  updateStatus(
    @Req() req: express.Request,
    @Param('id') id: string,
    @Body() dto: UpdateStatusDto,
  ) {
    const user = req.user as { sub: string; email: string };
    return this.competitorsService.updateStatus(id, user.sub, dto.status);
  }

  @Patch(':id/weight')
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  updateWeight(
    @Req() req: express.Request,
    @Param('id') id: string,
    @Body() dto: UpdateWeightDto,
  ) {
    const user = req.user as { sub: string; email: string };
    return this.competitorsService.updateWeight(id, user.sub, dto.weight);
  }

  @Patch(':id/withdraw')
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  withdraw(
    @Req() req: express.Request,
    @Param('id') id: string,
  ) {
    const user = req.user as { sub: string; email: string };
    return this.competitorsService.withdraw(id, user.sub);
  }

  // Atomic weigh-in: records weight, sets WEIGHED_IN, returns IJF projection
  // before/after so the UI can show "bumped from -73 to -81kg".
  @Patch(':id/weigh-in')
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  weighIn(
    @Req() req: express.Request,
    @Param('id') id: string,
    @Body() dto: UpdateWeightDto,
  ) {
    const user = req.user as { sub: string; email: string };
    return this.competitorsService.recordWeight(id, user.sub, dto.weight);
  }

  // Organizer-driven disqualification (distinct from withdraw, which is
  // pre-bracket self-removal). Works at any competition status.
  @Patch(':id/disqualify')
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  disqualify(
    @Req() req: express.Request,
    @Param('id') id: string,
  ) {
    const user = req.user as { sub: string; email: string };
    return this.competitorsService.disqualify(id, user.sub);
  }
}
