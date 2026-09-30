import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma, Role } from '../../../../generated/prisma/client';
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
    mission: {
      create: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      updateMany: jest.Mock;
      count: jest.Mock;
      findUniqueOrThrow: jest.Mock;
    };
    $transaction: jest.Mock;
    $queryRaw: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      mission: {
        create: jest.fn().mockResolvedValue(missionRow()),
        findMany: jest.fn().mockResolvedValue([missionRow()]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        count: jest.fn().mockResolvedValue(1),
        findUniqueOrThrow: jest.fn().mockResolvedValue(missionRow()),
        findFirst: jest.fn().mockResolvedValue(
          missionRow({
            statusHistory: [
              {
                id: 'h1',
                fromStatus: null,
                toStatus: 'PLANNED',
                note: null,
                createdAt: new Date('2026-09-30T08:00:00Z'),
                actor: { id: DISPATCHER_ID, fullName: 'Awa Dispatch' },
              },
            ],
          }),
        ),
      },
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

  const dispatcher = { id: DISPATCHER_ID, role: Role.DISPATCHER };
  const driver = { id: DRIVER_ID, role: Role.DRIVER };

  describe('findAll', () => {
    const whereOfLastCall = (): Record<string, unknown> =>
      (
        prisma.mission.findMany.mock.calls[0][0] as {
          where: Record<string, unknown>;
        }
      ).where;

    it("defaults to today's missions (Africa/Douala)", async () => {
      await service.findAll({}, dispatcher);

      expect(whereOfLastCall()).toEqual({
        plannedDate: new Date(`${businessToday()}T00:00:00.000Z`),
      });
    });

    it('passes the dispatcher filters through', async () => {
      await service.findAll(
        { date: '2026-10-02', driverId: DRIVER_ID, status: 'STARTED' },
        dispatcher,
      );

      expect(whereOfLastCall()).toEqual({
        plannedDate: new Date('2026-10-02T00:00:00.000Z'),
        driverId: DRIVER_ID,
        status: 'STARTED',
      });
    });

    it("forces a DRIVER's own id, whatever driverId he sends", async () => {
      await service.findAll({ driverId: 'another-driver-id' }, driver);

      expect(whereOfLastCall()).toMatchObject({ driverId: DRIVER_ID });
    });

    it('maps rows to response DTOs (date as YYYY-MM-DD)', async () => {
      await expect(service.findAll({}, dispatcher)).resolves.toEqual([
        expect.objectContaining({ id: MISSION_ID, plannedDate: '2026-10-01' }),
      ]);
    });
  });

  describe('update', () => {
    const OTHER_DRIVER_ID = '9e8d7c6b-5a49-4382-a716-151413121110';

    it('writes only while the mission is PLANNED (status in the where) and bumps the version', async () => {
      await service.update(MISSION_ID, { customerName: 'Nouveau client' });

      expect(prisma.mission.updateMany).toHaveBeenCalledWith({
        where: { id: MISSION_ID, status: 'PLANNED' },
        data: expect.objectContaining({
          customerName: 'Nouveau client',
          version: { increment: 1 },
        }) as unknown,
      });
      // Pas de réassignation → pas de verrou chauffeur.
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });

    it('reassigns under the lock of the NEW driver', async () => {
      await service.update(MISSION_ID, { driverId: OTHER_DRIVER_ID });

      expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
      expect(prisma.$queryRaw.mock.calls[0]).toContain(OTHER_DRIVER_ID);
      expect(prisma.mission.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            driverId: OTHER_DRIVER_ID,
          }) as unknown,
        }),
      );
    });

    it('refuses to reassign to a disabled driver, without writing', async () => {
      prisma.$queryRaw.mockResolvedValue([
        { id: OTHER_DRIVER_ID, isActive: false },
      ]);

      await expect(
        service.update(MISSION_ID, { driverId: OTHER_DRIVER_ID }),
      ).rejects.toThrow(new BadRequestException('DRIVER_INACTIVE'));
      expect(prisma.mission.updateMany).not.toHaveBeenCalled();
    });

    it('→ 409 MISSION_NOT_EDITABLE when the mission exists but is no longer PLANNED', async () => {
      prisma.mission.updateMany.mockResolvedValue({ count: 0 });
      prisma.mission.count.mockResolvedValue(1);

      await expect(
        service.update(MISSION_ID, { customerName: 'X' }),
      ).rejects.toThrow(new ConflictException('MISSION_NOT_EDITABLE'));
    });

    it('→ 404 MISSION_NOT_FOUND when the mission does not exist', async () => {
      prisma.mission.updateMany.mockResolvedValue({ count: 0 });
      prisma.mission.count.mockResolvedValue(0);

      await expect(
        service.update(MISSION_ID, { customerName: 'X' }),
      ).rejects.toThrow(new NotFoundException('MISSION_NOT_FOUND'));
    });

    it('refuses to move the mission to a past date', async () => {
      await expect(
        service.update(MISSION_ID, { plannedDate: '2000-01-01' }),
      ).rejects.toThrow(new BadRequestException('PLANNED_DATE_IN_PAST'));
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('restricts a DRIVER to his own missions IN the query', async () => {
      await service.findOne(MISSION_ID, driver);

      expect(prisma.mission.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: MISSION_ID, driverId: DRIVER_ID },
        }),
      );
    });

    it('lets the DISPATCHER read any mission', async () => {
      await service.findOne(MISSION_ID, dispatcher);

      expect(prisma.mission.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: MISSION_ID } }),
      );
    });

    it("→ 404 MISSION_NOT_FOUND for another driver's mission (existence not revealed)", async () => {
      prisma.mission.findFirst.mockResolvedValue(null);

      await expect(service.findOne(MISSION_ID, driver)).rejects.toThrow(
        new NotFoundException('MISSION_NOT_FOUND'),
      );
    });

    it('returns the status history with its author', async () => {
      const result = await service.findOne(MISSION_ID, dispatcher);

      expect(result.statusHistory).toEqual([
        {
          id: 'h1',
          fromStatus: null,
          toStatus: 'PLANNED',
          note: null,
          actor: { id: DISPATCHER_ID, fullName: 'Awa Dispatch' },
          createdAt: new Date('2026-09-30T08:00:00Z'),
        },
      ]);
    });
  });
});
