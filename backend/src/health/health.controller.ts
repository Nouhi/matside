import {
  Controller,
  Get,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Public } from '../auth/public.decorator';

@Public()
@Controller('health')
export class HealthController {
  private readonly logger = new Logger('Health');

  constructor(private prisma: PrismaService) {}

  @Get()
  async check() {
    let db: 'up' | 'down' = 'down';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      db = 'up';
    } catch (err) {
      this.logger.error('Database health check failed', err as Error);
    }

    const payload = {
      status: db === 'up' ? 'ok' : 'degraded',
      db,
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };

    // 503 when degraded so uptime monitors and load balancers see the failure.
    if (db !== 'up') {
      throw new ServiceUnavailableException(payload);
    }

    return payload;
  }
}
