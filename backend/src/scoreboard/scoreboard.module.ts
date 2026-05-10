import { Module } from '@nestjs/common';
import { ScoreboardGateway } from './scoreboard.gateway';
import { ScoreboardService } from './scoreboard.service';
import { MatService } from './mat.service';
import { MatController } from './mat.controller';
import { SchedulerService } from './scheduler.service';

@Module({
  controllers: [MatController],
  providers: [ScoreboardGateway, ScoreboardService, MatService, SchedulerService],
  exports: [ScoreboardService, MatService, SchedulerService],
})
export class ScoreboardModule {}
