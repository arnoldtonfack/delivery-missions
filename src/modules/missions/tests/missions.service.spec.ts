import { BadRequestException, ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '../../../../generated/prisma/client';
import { businessToday } from '../../../common/utils/business-date.util';
import { PrismaService } from '../../../database/prisma.service';
import type { CreateMissionDto } from '../dto/create-mission.dto';
import { MissionsService } from '../missions.service';

const DISPATCHER_ID = '0b7a3c52-1f7e-4d0a-9a51-6c1d2e3f4a50';
const DRIVER_ID = '6f1c2b1e-8a7d-4f55-9d0f-0c5b1f0a1e11';
const MISSION_ID = 'a3d9e2f1-5b6c-4d7e-8f90-1a2b3c4d5e6f';

const missionRow = (
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> => ({
  id: MISSION_ID,
  reference: 'CMD-001',
  customerName: 'Client',
  pickupAddress: 'A',
  deliveryAddress: 'B',
  plannedDate: new Date('2026-10-01T00:00:00Z'),
  status: 'PLANNED',
  failureReason: null,
  deliveryComment: null,
  startedAt: null,
  completedAt: null,
  createdAt: new Date('2026-09-30T08:00:00Z'),
  updatedAt: new Date('2026-09-30T08:00:00Z'),
  driver: { id: DRIVER_ID, fullName: 'Jean Mbarga' },
  ...overrides,
});

const createDto = (
  overrides: Partial<CreateMissionDto> = {},
): CreateMissionDto => ({
  reference: 'CMD-001',
  customerName: 'Client',
  pickupAddress: 'A',
  deliveryAddress: 'B',
  plannedDate: businessToday(),
  driverId: DRIVER_ID,
  ...overrides,
});

describe('MissionsService', () => {
  let service: MissionsService;
  let prisma: {
    mission: { create: jest.Mock };
    $transaction: jest.Mock;
    $queryRaw: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      mission: { create: jest.fn().mockResolvedValue(missionRow()) },
      // Verrou `SELECT … FOR UPDATE` du chauffeur.
      $queryRaw: jest
        .fn()
        .mockResolvedValue([{ id: DRIVER_ID, isActive: true }]),
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation(
      (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma),
    );

    const module = await Test.createTestingModule({
      providers: [
        MissionsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(MissionsService);
  });

  describe('create', () => {
    it('creates a PLANNED mission for today with a null → PLANNED history entry by the dispatcher', async () => {
      const today = businessToday();

      const result = await service.create(
        createDto({ plannedDate: today }),
        DISPATCHER_ID,
      );

      expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
      const { data } = prisma.mission.create.mock.calls[0][0] as {
        data: Record<string, unknown>;
      };
      expect(data).toMatchObject({
        driverId: DRIVER_ID,
        createdById: DISPATCHER_ID,
        plannedDate: new Date(`${today}T00:00:00.000Z`),
        statusHistory: {
          create: {
            fromStatus: null,
            toStatus: 'PLANNED',
            actorId: DISPATCHER_ID,
          },
        },
      });
      expect(result).toMatchObject({
        plannedDate: '2026-10-01',
        status: 'PLANNED',
        driver: { id: DRIVER_ID, fullName: 'Jean Mbarga' },
      });
    });

    it('refuses a planned date before today (Africa/Douala) without touching the database', async () => {
      await expect(
        service.create(createDto({ plannedDate: '2000-01-01' }), DISPATCHER_ID),
      ).rejects.toThrow(new BadRequestException('PLANNED_DATE_IN_PAST'));
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('refuses an id that is not a driver with DRIVER_NOT_FOUND', async () => {
      prisma.$queryRaw.mockResolvedValue([]);

      await expect(service.create(createDto(), DISPATCHER_ID)).rejects.toThrow(
        new BadRequestException('DRIVER_NOT_FOUND'),
      );
      expect(prisma.mission.create).not.toHaveBeenCalled();
    });

    it('refuses a disabled driver with DRIVER_INACTIVE', async () => {
      prisma.$queryRaw.mockResolvedValue([{ id: DRIVER_ID, isActive: false }]);

      await expect(service.create(createDto(), DISPATCHER_ID)).rejects.toThrow(
        new BadRequestException('DRIVER_INACTIVE'),
      );
      expect(prisma.mission.create).not.toHaveBeenCalled();
    });

    it('maps the unique violation on the reference to MISSION_REFERENCE_ALREADY_USED', async () => {
      prisma.mission.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('unique', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );

      await expect(service.create(createDto(), DISPATCHER_ID)).rejects.toThrow(
        new ConflictException('MISSION_REFERENCE_ALREADY_USED'),
      );
    });
  });
});
