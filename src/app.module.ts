import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { CacheModule } from '@nestjs/cache-manager';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from './database/prisma.module';
import { RedisModule } from './common/redis/redis.module';
import { AppCacheModule } from './common/cache/cache.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { redisConfig } from './config/redis.config';
import { HealthModule } from './health/health.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { AuthModule } from './modules/auth/auth.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    // Cache applicatif (cache-manager + Redis). OPT-IN : rien n'est caché
    // automatiquement — passer par CacheService.getOrSet() sur les lectures choisies.
    CacheModule.registerAsync({
      isGlobal: true,
      inject: [ConfigService],
      useFactory: redisConfig,
    }),
    // Connexion BullMQ partagée. AUCUNE queue enregistrée : une queue n'est ajoutée
    // (BullModule.registerQueue dans le module métier) que si un besoin asynchrone
    // réel le justifie — traitement lourd, retry, tâche qui ne doit pas bloquer HTTP.
    // Tant qu'aucune queue n'existe, aucune connexion n'est ouverte.
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('REDIS_HOST'),
          port: Number(config.get<string>('REDIS_PORT')),
          password: config.get<string>('REDIS_PASSWORD') || undefined,
        },
      }),
    }),
    ThrottlerModule.forRoot({
      // Désactivé sous Jest (NODE_ENV=test) : les e2e enchaînent des dizaines de
      // requêtes par seconde depuis la même IP. Actif en dev et en production.
      skipIf: () => process.env.NODE_ENV === 'test',
      throttlers: [
        {
          name: 'short',
          ttl: 1_000,
          limit: 10,
        },
        {
          name: 'medium',
          ttl: 60_000,
          limit: 100,
        },
        {
          name: 'hour',
          ttl: 3_600_000,
          limit: 1_000,
        },
      ],
    }),
    PrismaModule,
    RedisModule,
    AppCacheModule,
    HealthModule,
    // ── Modules métier (src/modules/<domaine>) ──
    AuthModule,
  ],
  controllers: [],
  providers: [
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    // Ordre d'exécution = ordre de déclaration : débit → authentification → rôle.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
