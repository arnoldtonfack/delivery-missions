import { CacheModuleOptions } from '@nestjs/cache-manager';
import { ConfigService } from '@nestjs/config';
import KeyvRedis from '@keyv/redis';

export const redisConfig = (config: ConfigService): CacheModuleOptions => {
  const host = config.get<string>('REDIS_HOST');
  const port = config.get<string>('REDIS_PORT');
  const password = config.get<string>('REDIS_PASSWORD');
  const ttl = Number(config.get<string>('REDIS_TTL', '300')) * 1000;

  const url = password
    ? `redis://:${password}@${host}:${port}`
    : `redis://${host}:${port}`;

  return {
    stores: [new KeyvRedis(url)],
    ttl,
  };
};
