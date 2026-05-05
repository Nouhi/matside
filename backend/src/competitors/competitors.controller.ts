import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { Gender, RegistrationStatus } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CompetitorsService } from './competitors.service';

export class RegisterCompetitorDto {
  @IsString()
  @MinLength(1)
  firstName: string;

  @IsString()
  @MinLength(1)
  lastName: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsDateString()
  dateOfBirth: string;

  @IsEnum(Gender)
  gender: Gender;

  @IsOptional()
  @IsNumber()
  weight?: number;

  @IsOptional()
  @IsString()
  club?: string;
}

export class UpdateStatusDto {
  @IsEnum(RegistrationStatus)
  status: RegistrationStatus;
}

@Controller('competitions/:competitionId/competitors')
export class CompetitorsController {
  constructor(private competitorsService: CompetitorsService) {}

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
    });
  }

  @Get()
  findAll(@Param('competitionId') competitionId: string) {
    return this.competitorsService.findAll(competitionId);
  }

  @Patch(':id/status')
  @UseGuards(JwtAuthGuard)
  updateStatus(@Param('id') id: string, @Body() dto: UpdateStatusDto) {
    return this.competitorsService.updateStatus(id, dto.status);
  }
}
