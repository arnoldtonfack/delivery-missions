import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { withTimeout } from 'src/common/utils/with-timeout.util';
import { PrismaService } from '../database/prisma.service';
import { REDIS_HEALTH } from './redis-health.client';

const PROBE_TIMEOUT_MS = 2000;

export interface HealthChecks {
  db: boolean;
  redis: boolean;
}

export interface HealthPayload {
  status: 'ok' | 'degraded';
  checks: HealthChecks;
  timestamp: string;
}

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_HEALTH) private readonly redis: Redis,
  ) {}

  /** @description Probes db / redis in parallel with a per-probe timeout. */
  async check(): Promise<HealthPayload> {
    const [dbOk, redisOk] = await Promise.all([
      this.probe(() => this.prisma.$queryRaw`SELECT 1`),
      this.probe(() => this.redis.ping()),
    ]);

    const allOk = dbOk && redisOk;
    return {
      status: allOk ? 'ok' : 'degraded',
      checks: { db: dbOk, redis: redisOk },
      timestamp: new Date().toISOString(),
    };
  }

  private async probe(fn: () => Promise<unknown>): Promise<boolean> {
    try {
      await withTimeout(fn(), PROBE_TIMEOUT_MS);
      return true;
    } catch {
      return false;
    }
  }
}
