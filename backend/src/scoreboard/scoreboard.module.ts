import { Module } from '@nestjs/common';
import { ScoreboardGateway } from './scoreboard.gateway';
import { ScoreboardService } from './scoreboard.service';
import { MatService } from './mat.service';
import { MatController } from './mat.controller';

@Module({
  controllers: [MatController],
  providers: [ScoreboardGateway, ScoreboardService, MatService],
  exports: [ScoreboardService, MatService],
})
export class ScoreboardModule {}
