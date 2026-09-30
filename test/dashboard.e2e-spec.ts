import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import type { MissionStatus } from 'generated/prisma/client';
import { hashPassword } from 'src/common/crypto/password.util';
import {
  businessToday,
  dateOnlyToDate,
  dateToDateOnly,
} from 'src/common/utils/business-date.util';
import { PrismaService } from 'src/database/prisma.service';
import { apiPath, createE2eApp } from './utils/create-e2e-app';

/**
 * Dashboard de bout en bout contre la vraie base (`make infra`). Les missions
 * du dispatcher sont posées sur un jour lointain propre à ce run, pour que les
 * compteurs globaux ne comptent que les données du test.
 */
describe('Dashboard (e2e)', () => {
  const PASSWORD = 'Password123!';
  const suffix = `d${Date.now().toString(36)}`;
  const email = (name: string): string => `e2e-${name}-${suffix}@test.local`;
  // Un jour entre 2200 et ~2470, différent à chaque run.
  const isolatedDay = dateToDateOnly(
    new Date(Date.UTC(2200, 0, 1) + (Date.now() % 100_000) * 86_400_000),
  );

  let app: INestApplication<App>;
  let prisma: PrismaService;
  let dispatcherToken: string;
  let driverToken: string;
  let dispatcherId: string;
  let driverId: string;
  let otherDriverId: string;
  let counter = 0;

  const http = (): ReturnType<typeof request> => request(app.getHttpServer());
  const dashboard = (
    token: string,
    query: Record<string, string> = {},
  ): request.Test =>
    http()
      .get(apiPath('dashboard'))
      .query(query)
      .set('Authorization', `Bearer ${token}`);

  /** Mission posée directement en base, cohérente avec les contraintes CHECK. */
  const seedMission = async (
    day: string,
    status: MissionStatus,
    assignee: string,
  ): Promise<void> => {
    counter += 1;
    const now = new Date();
    await prisma.mission.create({
      data: {
        reference: `E2E-${suffix}-${counter}`.toUpperCase(),
        customerName: 'Client',
        pickupAddress: 'A',
        deliveryAddress: 'B',
        plannedDate: dateOnlyToDate(day),
        status,
        startedAt: status === 'PLANNED' ? null : now,
        completedAt: status === 'DELIVERED' || status === 'FAILED' ? now : null,
        failureReason: status === 'FAILED' ? 'Client absent' : null,
        driverId: assignee,
        createdById: dispatcherId,
      },
    });
  };

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
    const passwordHash = await hashPassword(PASSWORD);
    const createUser = async (
      name: string,
      role: 'DISPATCHER' | 'DRIVER',
    ): Promise<string> => {
      const user = await prisma.user.create({
        data: {
          email: email(name),
          fullName: `E2E ${name}`,
          role,
          passwordHash,
        },
      });
      return user.id;
    };
    const tokenFor = async (userEmail: string): Promise<string> => {
      const res = await http()
        .post(apiPath('auth/login'))
        .send({ email: userEmail, password: PASSWORD })
        .expect(200);
      return res.body.data.accessToken as string;
    };
    dispatcherId = await createUser('dispatcher', 'DISPATCHER');
    driverId = await createUser('driver', 'DRIVER');
    otherDriverId = await createUser('other-driver', 'DRIVER');
    dispatcherToken = await tokenFor(email('dispatcher'));
    driverToken = await tokenFor(email('driver'));

    // Jour isolé : 2 PLANNED, 1 STARTED, 1 DELIVERED, 1 FAILED, dont 1 à l'autre chauffeur.
    await seedMission(isolatedDay, 'PLANNED', driverId);
    await seedMission(isolatedDay, 'PLANNED', otherDriverId);
    await seedMission(isolatedDay, 'STARTED', driverId);
    await seedMission(isolatedDay, 'DELIVERED', driverId);
    await seedMission(isolatedDay, 'FAILED', driverId);
    // Aujourd'hui : 1 mission du chauffeur, 1 de l'autre.
    await seedMission(businessToday(), 'STARTED', driverId);
    await seedMission(businessToday(), 'PLANNED', otherDriverId);
  });

  afterAll(async () => {
    const where = { email: { endsWith: `-${suffix}@test.local` } };
    await prisma.mission.deleteMany({ where: { createdBy: where } });
    await prisma.user.deleteMany({ where });
    await app.close();
  });

  it('dispatcher: every mission of the day, by status, all four statuses present', async () => {
    const res = await dashboard(dispatcherToken, { date: isolatedDay }).expect(
      200,
    );

    expect(res.body.data).toEqual({
      date: isolatedDay,
      total: 5,
      byStatus: { PLANNED: 2, STARTED: 1, DELIVERED: 1, FAILED: 1 },
    });
  });

  it('driver: only HIS missions, whatever the day', async () => {
    const res = await dashboard(driverToken, { date: isolatedDay }).expect(200);

    expect(res.body.data).toEqual({
      date: isolatedDay,
      total: 4,
      byStatus: { PLANNED: 1, STARTED: 1, DELIVERED: 1, FAILED: 1 },
    });
  });

  it("without date: today's missions (Africa/Douala)", async () => {
    const res = await dashboard(driverToken).expect(200);

    expect(res.body.data).toEqual({
      date: businessToday(),
      total: 1,
      byStatus: { PLANNED: 0, STARTED: 1, DELIVERED: 0, FAILED: 0 },
    });
  });

  it('400 on an invalid date, 401 without token', async () => {
    await dashboard(dispatcherToken, { date: '2026-02-30' }).expect(400);
    await http().get(apiPath('dashboard')).expect(401);
  });
});
