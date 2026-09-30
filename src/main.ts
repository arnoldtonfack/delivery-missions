import { NestFactory } from '@nestjs/core';
import { Logger, RequestMethod, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { API_VERSION, GLOBAL_PREFIX } from './common/constants/api.constants';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { validateRequiredEnv } from './config/required-env';

const SWAGGER_PATH = 'docs';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const logger = new Logger('Bootstrap');
  const isProd = process.env.NODE_ENV === 'production';

  // Placé APRÈS `NestFactory.create` : c'est `ConfigModule.forRoot` qui charge `.env`
  // dans `process.env`. L'échec survient avant `listen()` → le health check ne passe pas.
  validateRequiredEnv();

  // Derrière un reverse proxy / load balancer (Render, nginx…) : un seul saut à
  // dé-empiler pour que `req.ip` soit l'IP cliente (rate limiting).
  app.set('trust proxy', 1);
  app.enableShutdownHooks();

  // Security. Sans `upgrade-insecure-requests` : l'API peut être servie en HTTP simple
  // (démo IP:port) ; la directive ferait charger les assets Swagger en https:// → page vide.
  app.use(
    helmet({
      contentSecurityPolicy: { directives: { upgradeInsecureRequests: null } },
    }),
  );

  // CORS : liste explicite d'origines (CORS_ORIGIN, séparées par des virgules).
  // En dev sans valeur, toutes les origines sont acceptées ; en prod elle est exigée.
  const corsOrigin = process.env.CORS_ORIGIN;
  app.enableCors({
    origin: corsOrigin ? corsOrigin.split(',').map((o) => o.trim()) : !isProd,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
  });

  // Response formatting
  app.useGlobalInterceptors(new ResponseInterceptor());

  // Validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Versioning — /health stays unprefixed for Docker HEALTHCHECK & platform probes
  app.setGlobalPrefix(GLOBAL_PREFIX, {
    exclude: [{ path: 'health', method: RequestMethod.GET }],
  });

  // Swagger
  const swaggerConfig = new DocumentBuilder()
    .setTitle(process.env.APP_NAME ?? 'Delivery Missions API')
    .setDescription('API documentation')
    .setVersion(API_VERSION)
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup(SWAGGER_PATH, app, document);

  const port = process.env.PORT ?? 3000;
  const appName = process.env.APP_NAME ?? 'Delivery Missions API';
  const env = process.env.NODE_ENV ?? 'development';

  await app.listen(port);

  logger.log(`${appName} is running`);
  logger.log(`Environment : ${env}`);
  logger.log(`URL         : http://localhost:${port}/${GLOBAL_PREFIX}`);
  logger.log(`Swagger     : http://localhost:${port}/${SWAGGER_PATH}`);
  logger.log(`Health      : http://localhost:${port}/health`);
}
void bootstrap();
