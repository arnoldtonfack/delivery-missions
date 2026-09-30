import { ConfigService } from '@nestjs/config';
import { RedisOptions } from 'ioredis';

/** DI token for the shared, application-wide ioredis client. */
export const REDIS_CLIENT = 'REDIS_CLIENT';

/**
 * Builds the ioredis connection options from environment configuration.
 *
 * Tuned to fail fast (no offline queue, single retry per request) so that
 * callers never hang when Redis is unreachable — they reject quickly and can
 * degrade gracefully.
 */
export const buildRedisOptions = (config: ConfigService): RedisOptions => ({
  host: config.get<string>('REDIS_HOST'),
  port: Number(config.get<string>('REDIS_PORT')),
  password: config.get<string>('REDIS_PASSWORD') || undefined,
  lazyConnect: false,
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
});
