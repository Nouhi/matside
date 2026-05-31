import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { RolesGuard } from './auth/roles.guard';
import { AuthModule } from './auth/auth.module';
import { CompetitionsModule } from './competitions/competitions.module';
import { CompetitorsModule } from './competitors/competitors.module';
import { CategoriesModule } from './categories/categories.module';
import { BracketsModule } from './brackets/brackets.module';
import { ScoreboardModule } from './scoreboard/scoreboard.module';
import { StandingsModule } from './standings/standings.module';
import { AthletesModule } from './athletes/athletes.module';
import { HealthModule } from './health/health.module';

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
    StandingsModule,
    AthletesModule,
    HealthModule,
  ],
  providers: [
    // Order matters: JwtAuthGuard authenticates (populating req.user) before
    // RolesGuard authorizes. Both short-circuit on @Public routes. This makes
    // every route default-protected — a new route is organizer-only unless it
    // opts out with @Public or opts into a role with @Roles.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
