import { Module } from '@nestjs/common';
import { AthletesModule } from '../athletes/athletes.module';
import { CompetitorsController } from './competitors.controller';
import { CompetitorsService } from './competitors.service';

@Module({
  imports: [AthletesModule],
  controllers: [CompetitorsController],
  providers: [CompetitorsService],
})
export class CompetitorsModule {}
