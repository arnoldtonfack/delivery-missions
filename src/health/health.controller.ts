import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from 'src/common/decorators/public.decorator';
import { HealthPayload, HealthService } from './health.service';

@ApiTags('health')
@Public()
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  async check(): Promise<HealthPayload> {
    const payload = await this.healthService.check();
    if (payload.status === 'degraded') {
      throw new ServiceUnavailableException(payload);
    }
    return payload;
  }
}
