import {
  INestApplication,
  RequestMethod,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { once } from 'events';
import type Redis from 'ioredis';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from 'src/app.module';
import { cacheKey } from 'src/common/cache/cache.keys';
import { CacheService } from 'src/common/cache/cache.service';
import { GLOBAL_PREFIX } from 'src/common/constants/api.constants';
import { ResponseInterceptor } from 'src/common/interceptors/response.interceptor';
import { REDIS_HEALTH } from 'src/health/redis-health.client';

/**
 * E2E contre une vraie base et un vrai Redis :
 * `docker compose up -d postgres redis` avant `pnpm test:e2e`.
 */
describe('App (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalInterceptors(new ResponseInterceptor());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.setGlobalPrefix(GLOBAL_PREFIX, {
      exclude: [{ path: 'health', method: RequestMethod.GET }],
    });
    await app.init();

    // Le client de sonde n'a pas de file hors-ligne (fail-fast) : on attend qu'il
    // soit connecté, sinon la toute première sonde échoue par construction.
    const redis = app.get<Redis>(REDIS_HEALTH);
    if (redis.status !== 'ready') await once(redis, 'ready');
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health → 200 with db and redis up', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);

    expect(res.body).toMatchObject({
      success: true,
      data: { status: 'ok', checks: { db: true, redis: true } },
    });
  });

  it('unknown route → 404 in the normalized error format', async () => {
    const res = await request(app.getHttpServer())
      .get(`/${GLOBAL_PREFIX}/does-not-exist`)
      .expect(404);

    expect(res.body).toMatchObject({ statusCode: 404, error: 'Not Found' });
  });

  it('CacheService round-trips through the real Redis and invalidates', async () => {
    const cache = app.get(CacheService);
    const key = cacheKey('e2e', 'round-trip', Date.now());
    const loader = jest.fn().mockResolvedValue({ value: 42 });

    await expect(cache.getOrSet(key, loader, 30)).resolves.toEqual({
      value: 42,
    });
    await expect(cache.getOrSet(key, loader, 30)).resolves.toEqual({
      value: 42,
    });
    expect(loader).toHaveBeenCalledTimes(1);

    await cache.del(key);
    await expect(cache.get(key)).resolves.toBeUndefined();
  });
});
