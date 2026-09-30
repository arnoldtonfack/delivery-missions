import {
  Global,
  Inject,
  Module,
  OnApplicationShutdown,
  Provider,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { REDIS_CLIENT, buildRedisOptions } from './redis.constants';

const redisClientProvider: Provider = {
  provide: REDIS_CLIENT,
  inject: [ConfigService],
  useFactory: (config: ConfigService): Redis =>
    new Redis(buildRedisOptions(config)),
};

/**
 * Global module exposing a single shared ioredis client under
 * {@link REDIS_CLIENT}, for direct Redis needs beyond the cache (counters,
 * locks, rate limits…). Inject it instead of opening a new connection.
 */
@Global()
@Module({
  providers: [redisClientProvider],
  exports: [REDIS_CLIENT],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS_CLIENT) private readonly client: Redis) {}

  /** Closes the shared connection gracefully on application shutdown. */
  async onApplicationShutdown(): Promise<void> {
    await this.client.quit();
  }
}
