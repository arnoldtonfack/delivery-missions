import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../../database/prisma.service';
import { DriversService } from '../drivers.service';

const DRIVER_ID = '6f1c2b1e-8a7d-4f55-9d0f-0c5b1f0a1e11';

const driverRow = (
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> => ({
  id: DRIVER_ID,
  email: 'jean@delivery.cm',
  fullName: 'Jean Mbarga',
  role: 'DRIVER',
  isActive: true,
  createdAt: new Date('2026-09-30T08:00:00Z'),
  ...overrides,
});

describe('DriversService', () => {
  let service: DriversService;
  let prisma: {
    user: {
      create: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    mission: { count: jest.Mock };
    $transaction: jest.Mock;
    $queryRaw: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      user: {
        create: jest.fn().mockResolvedValue(driverRow()),
        findMany: jest.fn().mockResolvedValue([driverRow()]),
        findFirst: jest.fn().mockResolvedValue(driverRow()),
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue(driverRow()),
      },
      mission: { count: jest.fn().mockResolvedValue(0) },
      // Verrou `SELECT … FOR UPDATE` : renvoie la ligne du chauffeur verrouillée.
      $queryRaw: jest.fn().mockResolvedValue([{ id: DRIVER_ID }]),
      // Le callback reçoit le client transactionnel : ici, le même mock.
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation(
      (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma),
    );

    const module = await Test.createTestingModule({
      providers: [DriversService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(DriversService);
  });

  describe('create', () => {
    it('creates a DRIVER with a bcrypt hash, never the clear password', async () => {
      await service.create({
        fullName: 'Jean Mbarga',
        email: 'jean@delivery.cm',
        password: 'Password123!',
      });

      const { data } = prisma.user.create.mock.calls[0][0] as {
        data: Record<string, unknown>;
      };
      expect(data.role).toBe('DRIVER');
      expect(data.passwordHash).toMatch(/^\$2[aby]\$10\$/);
      expect(data).not.toHaveProperty('password');
    });

    it('rejects an e-mail already used with EMAIL_ALREADY_USED', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'someone-else' });

      await expect(
        service.create({
          fullName: 'Jean Mbarga',
          email: 'jean@delivery.cm',
          password: 'Password123!',
        }),
      ).rejects.toThrow(new ConflictException('EMAIL_ALREADY_USED'));
      expect(prisma.user.create).not.toHaveBeenCalled();
    });
  });

  it('findOne → DRIVER_NOT_FOUND for an unknown id or a non-driver user', async () => {
    prisma.user.findFirst.mockResolvedValue(null);

    await expect(service.findOne(DRIVER_ID)).rejects.toThrow(
      new NotFoundException('DRIVER_NOT_FOUND'),
    );
    expect(prisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: DRIVER_ID, role: 'DRIVER' } }),
    );
  });

  it('update lets a driver keep his own e-mail', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: DRIVER_ID });

    await expect(
      service.update(DRIVER_ID, { email: 'jean@delivery.cm' }),
    ).resolves.toMatchObject({ id: DRIVER_ID });
  });

  describe('setActive', () => {
    it('refuses to disable a driver who still has PLANNED/STARTED missions', async () => {
      prisma.mission.count.mockResolvedValue(2);

      await expect(service.setActive(DRIVER_ID, false)).rejects.toThrow(
        new ConflictException('DRIVER_HAS_OPEN_MISSIONS'),
      );
      expect(prisma.mission.count).toHaveBeenCalledWith({
        where: { driverId: DRIVER_ID, status: { in: ['PLANNED', 'STARTED'] } },
      });
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('disables a driver without open missions', async () => {
      prisma.user.update.mockResolvedValue(driverRow({ isActive: false }));

      await expect(service.setActive(DRIVER_ID, false)).resolves.toMatchObject({
        isActive: false,
      });
    });

    it('setActive → DRIVER_NOT_FOUND when the locked row is not a driver', async () => {
      prisma.$queryRaw.mockResolvedValue([]);

      await expect(service.setActive(DRIVER_ID, false)).rejects.toThrow(
        new NotFoundException('DRIVER_NOT_FOUND'),
      );
    });

    it('re-enables a driver without checking missions', async () => {
      await service.setActive(DRIVER_ID, true);

      expect(prisma.mission.count).not.toHaveBeenCalled();
    });
  });
});
