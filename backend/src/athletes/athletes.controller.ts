import {
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
} from '@nestjs/common';
import { AthletesService } from './athletes.service';

// Athlete profile read is public — same pattern as the spectator page.
// Sanitization is at the service boundary (no email, no DOB beyond age,
// no registrationStatus stigma). If you want organizer-grade detail,
// hit the per-competitor endpoints.
@Controller('public/athletes')
export class PublicAthletesController {
  constructor(private athletesService: AthletesService) {}

  @Get(':id')
  @Header('Cache-Control', 'public, max-age=30')
  async getProfile(@Param('id') id: string) {
    const profile = await this.athletesService.getProfile(id);
    if (!profile) throw new NotFoundException('Athlete not found');
    return profile;
  }
}
