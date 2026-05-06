import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { CompetitionsModule } from './competitions/competitions.module';
import { CompetitorsModule } from './competitors/competitors.module';
import { CategoriesModule } from './categories/categories.module';
import { BracketsModule } from './brackets/brackets.module';
import { ScoreboardModule } from './scoreboard/scoreboard.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    CompetitionsModule,
    CompetitorsModule,
    CategoriesModule,
    BracketsModule,
    ScoreboardModule,
  ],
})
export class AppModule {}
