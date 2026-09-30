import { Test } from '@nestjs/testing';
import { PrismaService } from '../database/prisma.service';
import { HealthService } from './health.service';
import { REDIS_HEALTH } from './redis-health.client';

describe('HealthService', () => {
  let service: HealthService;
  let prisma: { $queryRaw: jest.Mock };
  let redis: { ping: jest.Mock };

  beforeEach(async () => {
    prisma = { $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]) };
    redis = { ping: jest.fn().mockResolvedValue('PONG') };

    const module = await Test.createTestingModule({
      providers: [
        HealthService,
        { provide: PrismaService, useValue: prisma },
        { provide: REDIS_HEALTH, useValue: redis },
      ],
    }).compile();
    service = module.get(HealthService);
  });

  it('returns status=ok when all probes resolve', async () => {
    const payload = await service.check();

    expect(payload.status).toBe('ok');
    expect(payload.checks).toEqual({ db: true, redis: true });
  });

  it('marks redis as down when redis.ping() rejects', async () => {
    redis.ping.mockRejectedValue(new Error('ECONNREFUSED'));

    const payload = await service.check();

    expect(payload.checks).toEqual({ db: true, redis: false });
    expect(payload.status).toBe('degraded');
  });

  it('marks db as down when prisma.$queryRaw rejects', async () => {
    prisma.$queryRaw.mockRejectedValue(new Error('connection lost'));

    const payload = await service.check();

    expect(payload.checks).toEqual({ db: false, redis: true });
  });

  it('marks a probe as down when it exceeds the 2s timeout', async () => {
    redis.ping.mockImplementation(() => new Promise(() => undefined));

    const payload = await service.check();

    expect(payload.checks.redis).toBe(false);
    expect(payload.checks.db).toBe(true);
    expect(payload.status).toBe('degraded');
  }, 5000);
});
