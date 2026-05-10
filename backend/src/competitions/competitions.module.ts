import { Module } from '@nestjs/common';
import { BracketsModule } from '../brackets/brackets.module';
import { StandingsModule } from '../standings/standings.module';
import { ScoreboardModule } from '../scoreboard/scoreboard.module';
import { CompetitionsController } from './competitions.controller';
import { PublicCompetitionsController } from './competitions.public.controller';
import { CompetitionsService } from './competitions.service';

@Module({
  imports: [BracketsModule, StandingsModule, ScoreboardModule],
  controllers: [CompetitionsController, PublicCompetitionsController],
  providers: [CompetitionsService],
})
export class CompetitionsModule {}
