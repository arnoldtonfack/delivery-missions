import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { redisHealthProvider } from './redis-health.client';

@Module({
  controllers: [HealthController],
  providers: [HealthService, redisHealthProvider],
})
export class HealthModule {}
