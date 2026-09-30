import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { hashPassword } from 'src/common/crypto/password.util';
import {
  businessToday,
  dateOnlyToDate,
  dateToDateOnly,
} from 'src/common/utils/business-date.util';
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
  let otherDriverToken: string;
  let dispatcherId: string;
  let driverId: string;
  let inactiveDriverId: string;
  let otherDriverId: string;

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
    otherDriverId = await createUser('other-driver', 'DRIVER');
    dispatcherToken = await tokenFor(email('dispatcher'));
    driverToken = await tokenFor(email('driver'));
    otherDriverToken = await tokenFor(email('other-driver'));
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

  describe('GET /missions', () => {
    const tomorrow = dateToDateOnly(
      new Date(dateOnlyToDate(businessToday()).getTime() + 86_400_000),
    );
    let todayMissionId: string;
    let tomorrowMissionId: string;
    let otherDriverMissionId: string;
    const listMissions = (
      token: string,
      query: Record<string, string> = {},
    ): request.Test =>
      http()
        .get(apiPath('missions'))
        .query(query)
        .set('Authorization', `Bearer ${token}`);
    const idsOf = (res: request.Response): string[] =>
      (res.body.data as { id: string }[]).map((m) => m.id);

    beforeAll(async () => {
      const today = await createMission(missionBody('list-today')).expect(201);
      const later = await createMission(
        missionBody('list-tomorrow', { plannedDate: tomorrow }),
      ).expect(201);
      const other = await createMission(
        missionBody('list-other', { driverId: otherDriverId }),
      ).expect(201);
      todayMissionId = today.body.data.id as string;
      tomorrowMissionId = later.body.data.id as string;
      otherDriverMissionId = other.body.data.id as string;
    });

    it('driver without filter: only HIS missions of today', async () => {
      const ids = idsOf(await listMissions(driverToken).expect(200));

      expect(ids).toContain(todayMissionId);
      expect(ids).not.toContain(tomorrowMissionId);
      expect(ids).not.toContain(otherDriverMissionId);
    });

    it("driver asking for another driver's missions still gets only his own", async () => {
      const res = await listMissions(driverToken, {
        driverId: otherDriverId,
      }).expect(200);

      expect(idsOf(res)).not.toContain(otherDriverMissionId);
      expect(
        (res.body.data as { driver: { id: string } }[]).every(
          (m) => m.driver.id === driverId,
        ),
      ).toBe(true);
    });

    it('dispatcher: filters by date, driver and status', async () => {
      const byDriver = await listMissions(dispatcherToken, {
        driverId: otherDriverId,
      }).expect(200);
      expect(idsOf(byDriver)).toEqual([otherDriverMissionId]);

      const byDate = await listMissions(dispatcherToken, {
        date: tomorrow,
        driverId,
        status: 'PLANNED',
      }).expect(200);
      expect(idsOf(byDate)).toEqual([tomorrowMissionId]);

      const byStatus = await listMissions(dispatcherToken, {
        driverId,
        status: 'DELIVERED',
      }).expect(200);
      expect(idsOf(byStatus)).toEqual([]);
    });

    it.each([
      ['an unknown status', { status: 'DONE' }],
      ['an impossible date', { date: '2026-13-01' }],
      ['a non-uuid driverId', { driverId: 'abc' }],
    ])('400 on %s', async (_label, query) => {
      await listMissions(dispatcherToken, query).expect(400);
    });
  });

  describe('GET /missions/:id', () => {
    let missionId: string;
    const getMission = (id: string, token: string): request.Test =>
      http()
        .get(apiPath(`missions/${id}`))
        .set('Authorization', `Bearer ${token}`);

    beforeAll(async () => {
      const res = await createMission(missionBody('detail')).expect(201);
      missionId = res.body.data.id as string;
    });

    it('dispatcher: 200 with the history (who, when)', async () => {
      const res = await getMission(missionId, dispatcherToken).expect(200);

      expect(res.body.data).toMatchObject({
        id: missionId,
        reference: reference('detail'),
        statusHistory: [
          {
            fromStatus: null,
            toStatus: 'PLANNED',
            note: null,
            actor: { id: dispatcherId, fullName: 'E2E dispatcher' },
          },
        ],
      });
      expect(typeof res.body.data.statusHistory[0].createdAt).toBe('string');
    });

    it('assigned driver: 200', async () => {
      await getMission(missionId, driverToken).expect(200);
    });

    it("another driver: 404 MISSION_NOT_FOUND, same as a mission that doesn't exist", async () => {
      const foreign = await getMission(missionId, otherDriverToken).expect(404);
      const missing = await getMission(
        '00000000-0000-4000-8000-000000000000',
        dispatcherToken,
      ).expect(404);

      expect(foreign.body).toMatchObject({ message: 'MISSION_NOT_FOUND' });
      expect(foreign.body).toEqual(missing.body);
    });

    it('400 for a non-uuid id', async () => {
      await getMission('not-a-uuid', dispatcherToken).expect(400);
    });
  });

  describe('PATCH /missions/:id', () => {
    const patchMission = (
      id: string,
      body: Record<string, unknown>,
      token = dispatcherToken,
    ): request.Test =>
      http()
        .patch(apiPath(`missions/${id}`))
        .set('Authorization', `Bearer ${token}`)
        .send(body);
    const newMission = async (name: string): Promise<string> => {
      const res = await createMission(missionBody(name)).expect(201);
      return res.body.data.id as string;
    };

    it('updates the sent fields and reassigns: the mission moves from one driver to the other', async () => {
      const id = await newMission('patch-ok');

      const res = await patchMission(id, {
        deliveryAddress: '  Nouvelle adresse ',
        driverId: otherDriverId,
      }).expect(200);

      expect(res.body.data).toMatchObject({
        deliveryAddress: 'Nouvelle adresse',
        customerName: 'Client E2E',
        status: 'PLANNED',
        driver: { id: otherDriverId },
      });
      await http()
        .get(apiPath(`missions/${id}`))
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(404);
      await http()
        .get(apiPath(`missions/${id}`))
        .set('Authorization', `Bearer ${otherDriverToken}`)
        .expect(200);
    });

    it('409 MISSION_NOT_EDITABLE once the mission is STARTED, even with an invalid driver in the body', async () => {
      const id = await newMission('patch-started');
      await prisma.mission.update({
        where: { id },
        data: { status: 'STARTED', startedAt: new Date() },
      });

      const res = await patchMission(id, {
        customerName: 'Trop tard',
        driverId: inactiveDriverId,
      }).expect(409);
      expect(res.body).toMatchObject({ message: 'MISSION_NOT_EDITABLE' });
    });

    it('an overdue PLANNED mission must be rescheduled to be reassigned', async () => {
      const id = await newMission('patch-overdue');
      await prisma.mission.update({
        where: { id },
        data: { plannedDate: new Date('2000-01-01T00:00:00Z') },
      });

      const refused = await patchMission(id, {
        driverId: otherDriverId,
      }).expect(400);
      expect(refused.body).toMatchObject({ message: 'PLANNED_DATE_IN_PAST' });

      await patchMission(id, {
        driverId: otherDriverId,
        plannedDate: businessToday(),
      }).expect(200);
    });

    it('empty body: 200, nothing written (version unchanged)', async () => {
      const id = await newMission('patch-empty');

      await patchMission(id, {}).expect(200);

      const row = await prisma.mission.findUniqueOrThrow({ where: { id } });
      expect(row.version).toBe(0);
    });

    it('400 DRIVER_INACTIVE when reassigning to a disabled driver', async () => {
      const id = await newMission('patch-inactive');

      const res = await patchMission(id, {
        driverId: inactiveDriverId,
      }).expect(400);
      expect(res.body).toMatchObject({ message: 'DRIVER_INACTIVE' });
    });

    it('409 MISSION_REFERENCE_ALREADY_USED when taking the reference of another mission', async () => {
      const id = await newMission('patch-ref');

      const res = await patchMission(id, {
        reference: reference('patch-ok'),
      }).expect(409);
      expect(res.body).toMatchObject({
        message: 'MISSION_REFERENCE_ALREADY_USED',
      });
    });

    it.each([
      ['a null field', { customerName: null }],
      ['a past date', { plannedDate: '2000-01-01' }],
      ['a status change (not editable here)', { status: 'DELIVERED' }],
    ])('400 on %s', async (_label, body) => {
      const id = await newMission(`patch-bad-${Object.keys(body)[0]}`);

      await patchMission(id, body).expect(400);
    });

    it('404 on an unknown mission, 403 for a DRIVER', async () => {
      await patchMission('00000000-0000-4000-8000-000000000000', {
        customerName: 'X',
      }).expect(404);

      const id = await newMission('patch-by-driver');
      await patchMission(id, { customerName: 'X' }, driverToken).expect(403);
    });
  });
});
