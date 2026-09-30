import { Test } from '@nestjs/testing';
import { Role } from '../../../../generated/prisma/client';
import { businessToday } from '../../../common/utils/business-date.util';
import { PrismaService } from '../../../database/prisma.service';
import { DashboardService } from '../dashboard.service';

const DISPATCHER_ID = '0b7a3c52-1f7e-4d0a-9a51-6c1d2e3f4a50';
const DRIVER_ID = '6f1c2b1e-8a7d-4f55-9d0f-0c5b1f0a1e11';

describe('DashboardService', () => {
  let service: DashboardService;
  let prisma: { mission: { groupBy: jest.Mock } };

  const dispatcher = { id: DISPATCHER_ID, role: Role.DISPATCHER };
  const driver = { id: DRIVER_ID, role: Role.DRIVER };
  const whereOfCall = (): Record<string, unknown> =>
    (
      prisma.mission.groupBy.mock.calls[0][0] as {
        where: Record<string, unknown>;
      }
    ).where;

  beforeEach(async () => {
    prisma = {
      mission: {
        groupBy: jest.fn().mockResolvedValue([
          { status: 'PLANNED', _count: { _all: 3 } },
          { status: 'DELIVERED', _count: { _all: 2 } },
        ]),
      },
    };
    const module = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(DashboardService);
  });

  it("counts today's missions (Africa/Douala) by status, missing statuses at 0", async () => {
    await expect(service.missionsByStatus({}, dispatcher)).resolves.toEqual({
      date: businessToday(),
      total: 5,
      byStatus: { PLANNED: 3, STARTED: 0, DELIVERED: 2, FAILED: 0 },
    });
    expect(whereOfCall()).toEqual({
      plannedDate: new Date(`${businessToday()}T00:00:00.000Z`),
    });
  });

  it('restricts a DRIVER to his own missions IN the query', async () => {
    await service.missionsByStatus({}, driver);

    expect(whereOfCall()).toMatchObject({ driverId: DRIVER_ID });
  });

  it('counts the requested day', async () => {
    const result = await service.missionsByStatus(
      { date: '2026-10-02' },
      dispatcher,
    );

    expect(result.date).toBe('2026-10-02');
    expect(whereOfCall()).toEqual({
      plannedDate: new Date('2026-10-02T00:00:00.000Z'),
    });
  });

  it('no mission: every status at 0, total 0', async () => {
    prisma.mission.groupBy.mockResolvedValue([]);

    await expect(service.missionsByStatus({}, driver)).resolves.toMatchObject({
      total: 0,
      byStatus: { PLANNED: 0, STARTED: 0, DELIVERED: 0, FAILED: 0 },
    });
  });
});
