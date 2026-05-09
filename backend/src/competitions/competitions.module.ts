import { Module } from '@nestjs/common';
import { CompetitionsController } from './competitions.controller';
import { PublicCompetitionsController } from './competitions.public.controller';
import { CompetitionsService } from './competitions.service';

@Module({
  controllers: [CompetitionsController, PublicCompetitionsController],
  providers: [CompetitionsService],
})
export class CompetitionsModule {}
