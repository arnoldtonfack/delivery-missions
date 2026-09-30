import {
  INestApplication,
  RequestMethod,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { App } from 'supertest/types';
import { AppModule } from 'src/app.module';
import { GLOBAL_PREFIX } from 'src/common/constants/api.constants';
import { ResponseInterceptor } from 'src/common/interceptors/response.interceptor';

/**
 * Application de test configurée comme `main.ts` (intercepteur, validation,
 * préfixe global). Les guards globaux (throttle, JWT, rôles) viennent d'AppModule.
 */
export const createE2eApp = async (): Promise<INestApplication<App>> => {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication<INestApplication<App>>();
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
  return app;
};

/** URL préfixée d'une route API (`/api/v1.0.0/<path>`). */
export const apiPath = (path: string): string => `/${GLOBAL_PREFIX}/${path}`;
