import { Module } from '@nestjs/common';
import { AthletesModule } from '../athletes/athletes.module';
import { CompetitorsController } from './competitors.controller';
import { CoachCompetitorsController } from './coach-competitors.controller';
import { CompetitorsService } from './competitors.service';

@Module({
  imports: [AthletesModule],
  controllers: [CompetitorsController, CoachCompetitorsController],
  providers: [CompetitorsService],
})
export class CompetitorsModule {}
