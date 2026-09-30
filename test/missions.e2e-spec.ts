import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { hashPassword } from 'src/common/crypto/password.util';
import { businessToday } from 'src/common/utils/business-date.util';
import { PrismaService } from 'src/database/prisma.service';
import { apiPath, createE2eApp } from './utils/create-e2e-app';

/**
 * Missions de bout en bout contre la vraie base (`make infra`).
 * Toutes les données créées portent un suffixe unique et sont supprimées.
 */
describe('Missions (e2e)', () => {
  const PASSWORD = 'Password123!';
  const suffix = `m${Date.now().toString(36)}`;
  const email = (name: string): string => `e2e-${name}-${suffix}@test.local`;
  const reference = (name: string): string =>
    `E2E-${suffix}-${name}`.toUpperCase();

  let app: INestApplication<App>;
  let prisma: PrismaService;
  let dispatcherToken: string;
  let driverToken: string;
  let dispatcherId: string;
  let driverId: string;
  let inactiveDriverId: string;

  const http = (): ReturnType<typeof request> => request(app.getHttpServer());
  const tokenFor = async (userEmail: string): Promise<string> => {
    const res = await http()
      .post(apiPath('auth/login'))
      .send({ email: userEmail, password: PASSWORD })
      .expect(200);
    return res.body.data.accessToken as string;
  };
  const missionBody = (
    name: string,
    overrides: Record<string, unknown> = {},
  ): Record<string, unknown> => ({
    reference: reference(name),
    customerName: 'Client E2E',
    pickupAddress: 'Entrepôt',
    deliveryAddress: 'Client',
    plannedDate: businessToday(),
    driverId,
    ...overrides,
  });
  const createMission = (
    body: Record<string, unknown>,
    token = dispatcherToken,
  ): request.Test =>
    http()
      .post(apiPath('missions'))
      .set('Authorization', `Bearer ${token}`)
      .send(body);

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
    const passwordHash = await hashPassword(PASSWORD);
    const createUser = async (
      name: string,
      role: 'DISPATCHER' | 'DRIVER',
      isActive = true,
    ): Promise<string> => {
      const user = await prisma.user.create({
        data: {
          email: email(name),
          fullName: `E2E ${name}`,
          role,
          isActive,
          passwordHash,
        },
      });
      return user.id;
    };
    dispatcherId = await createUser('dispatcher', 'DISPATCHER');
    driverId = await createUser('driver', 'DRIVER');
    inactiveDriverId = await createUser('inactive-driver', 'DRIVER', false);
    dispatcherToken = await tokenFor(email('dispatcher'));
    driverToken = await tokenFor(email('driver'));
  });

  afterAll(async () => {
    const where = { email: { endsWith: `-${suffix}@test.local` } };
    // L'historique part en cascade avec les missions.
    await prisma.mission.deleteMany({ where: { createdBy: where } });
    await prisma.user.deleteMany({ where });
    await app.close();
  });

  describe('POST /missions', () => {
    it('201: normalised reference, PLANNED, driver summary, history null → PLANNED by the dispatcher', async () => {
      const res = await createMission(
        missionBody('created', {
          reference: `  ${reference('created').toLowerCase()} `,
          customerName: '  Boulangerie  ',
        }),
      ).expect(201);

      expect(res.body.data).toMatchObject({
        reference: reference('created'),
        customerName: 'Boulangerie',
        plannedDate: businessToday(),
        status: 'PLANNED',
        failureReason: null,
        completedAt: null,
        driver: { id: driverId, fullName: 'E2E driver' },
      });
      const history = await prisma.missionStatusHistory.findMany({
        where: { missionId: res.body.data.id as string },
      });
      expect(history).toEqual([
        expect.objectContaining({
          fromStatus: null,
          toStatus: 'PLANNED',
          actorId: dispatcherId,
        }),
      ]);
    });

    it('409 MISSION_REFERENCE_ALREADY_USED on the same reference, whatever its case', async () => {
      await createMission(missionBody('dup')).expect(201);

      const res = await createMission(
        missionBody('dup', { reference: reference('dup').toLowerCase() }),
      ).expect(409);
      expect(res.body).toMatchObject({
        message: 'MISSION_REFERENCE_ALREADY_USED',
      });
    });

    it.each([
      ['a disabled driver', 'DRIVER_INACTIVE', (): string => inactiveDriverId],
      ['a non-driver user', 'DRIVER_NOT_FOUND', (): string => dispatcherId],
    ])('400 when assigned to %s (%s)', async (_label, code, target) => {
      const res = await createMission(
        missionBody(code, { driverId: target() }),
      ).expect(400);

      expect(res.body).toMatchObject({ message: code });
    });

    it('400 PLANNED_DATE_IN_PAST for a past date', async () => {
      const res = await createMission(
        missionBody('past', { plannedDate: '2000-01-01' }),
      ).expect(400);

      expect(res.body).toMatchObject({ message: 'PLANNED_DATE_IN_PAST' });
    });

    it.each([
      ['an impossible date', { plannedDate: '2026-02-30' }],
      ['a date with a time', { plannedDate: '2026-10-01T10:00:00Z' }],
      ['a blank customer name', { customerName: '   ' }],
      ['an unknown field', { status: 'DELIVERED' }],
    ])('400 on %s', async (_label, overrides) => {
      await createMission(missionBody('invalid', overrides)).expect(400);
    });

    it('403 for a DRIVER', async () => {
      const res = await createMission(
        missionBody('by-driver'),
        driverToken,
      ).expect(403);

      expect(res.body).toMatchObject({ message: 'INSUFFICIENT_ROLE' });
    });
  });
});
