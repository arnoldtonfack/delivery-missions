import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export const REDIS_HEALTH = 'REDIS_HEALTH';

export const redisHealthProvider: Provider = {
  provide: REDIS_HEALTH,
  inject: [ConfigService],
  useFactory: (config: ConfigService): Redis => {
    return new Redis({
      host: config.get<string>('REDIS_HOST'),
      port: Number(config.get<string>('REDIS_PORT')),
      password: config.get<string>('REDIS_PASSWORD') || undefined,
      lazyConnect: false,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
  },
};
