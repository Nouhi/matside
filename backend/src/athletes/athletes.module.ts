import { Module } from '@nestjs/common';
import { AthletesService } from './athletes.service';
import { PublicAthletesController } from './athletes.controller';

@Module({
  controllers: [PublicAthletesController],
  providers: [AthletesService],
  exports: [AthletesService],
})
export class AthletesModule {}
