import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('returns ok when the database responds', async () => {
    const prisma = { $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]) };
    const controller = new HealthController(prisma as never);

    const result = await controller.check();

    expect(result.status).toBe('ok');
    expect(result.db).toBe('up');
    expect(typeof result.uptime).toBe('number');
  });

  it('throws 503 with a degraded payload when the database is down', async () => {
    const prisma = { $queryRaw: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) };
    const controller = new HealthController(prisma as never);

    await expect(controller.check()).rejects.toBeInstanceOf(ServiceUnavailableException);
    try {
      await controller.check();
    } catch (e) {
      const body = (e as ServiceUnavailableException).getResponse() as { status: string; db: string };
      expect(body.status).toBe('degraded');
      expect(body.db).toBe('down');
    }
  });
});
