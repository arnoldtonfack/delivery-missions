import { ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { HealthPayload, HealthService } from './health.service';

describe('HealthController', () => {
  let controller: HealthController;
  let healthService: { check: jest.Mock };

  const okPayload: HealthPayload = {
    status: 'ok',
    checks: { db: true, redis: true },
    timestamp: '2026-01-01T10:00:00.000Z',
  };

  beforeEach(async () => {
    healthService = { check: jest.fn() };

    const module = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: HealthService, useValue: healthService }],
    }).compile();
    controller = module.get(HealthController);
  });

  it('returns the payload when all checks are ok', async () => {
    healthService.check.mockResolvedValue(okPayload);

    await expect(controller.check()).resolves.toEqual(okPayload);
  });

  it('throws ServiceUnavailableException when the payload is degraded', async () => {
    healthService.check.mockResolvedValue({
      ...okPayload,
      status: 'degraded',
      checks: { db: true, redis: false },
    });

    await expect(controller.check()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    await expect(controller.check()).rejects.toMatchObject({
      response: { checks: { redis: false } },
    });
  });
});
