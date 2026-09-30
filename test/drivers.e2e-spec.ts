import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { hashPassword } from 'src/common/crypto/password.util';
import { PrismaService } from 'src/database/prisma.service';
import { apiPath, createE2eApp } from './utils/create-e2e-app';

/**
 * Gestion des chauffeurs de bout en bout contre la vraie base (`make infra`).
 * Toutes les données créées portent un suffixe unique et sont supprimées.
 */
describe('Drivers (e2e)', () => {
  const PASSWORD = 'Password123!';
  const suffix = Date.now().toString(36);
  const email = (name: string): string => `e2e-${name}-${suffix}@test.local`;

  let app: INestApplication<App>;
  let prisma: PrismaService;
  let dispatcherToken: string;
  let driverToken: string;
  let dispatcherId: string;

  const http = (): ReturnType<typeof request> => request(app.getHttpServer());
  const tokenFor = async (userEmail: string): Promise<string> => {
    const res = await http()
      .post(apiPath('auth/login'))
      .send({ email: userEmail, password: PASSWORD })
      .expect(200);
    return res.body.data.accessToken as string;
  };
  const createDriver = (name: string): request.Test =>
    http()
      .post(apiPath('drivers'))
      .set('Authorization', `Bearer ${dispatcherToken}`)
      .send({
        fullName: `Driver ${name}`,
        email: email(name),
        password: PASSWORD,
      });

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
    const passwordHash = await hashPassword(PASSWORD);
    const dispatcher = await prisma.user.create({
      data: {
        email: email('dispatcher'),
        fullName: 'E2E Dispatcher',
        role: 'DISPATCHER',
        passwordHash,
      },
    });
    dispatcherId = dispatcher.id;
    await prisma.user.create({
      data: {
        email: email('existing-driver'),
        fullName: 'E2E Existing Driver',
        role: 'DRIVER',
        passwordHash,
      },
    });
    dispatcherToken = await tokenFor(email('dispatcher'));
    driverToken = await tokenFor(email('existing-driver'));
  });

  afterAll(async () => {
    const where = { email: { endsWith: `-${suffix}@test.local` } };
    await prisma.mission.deleteMany({ where: { createdBy: where } });
    await prisma.user.deleteMany({ where });
    await app.close();
  });

  it('POST /drivers → 201, normalised e-mail, no password hash', async () => {
    const res = await http()
      .post(apiPath('drivers'))
      .set('Authorization', `Bearer ${dispatcherToken}`)
      .send({
        fullName: '  Jean Mbarga ',
        email: `  E2E-JEAN-${suffix}@TEST.LOCAL `,
        password: PASSWORD,
      })
      .expect(201);

    expect(res.body.data).toMatchObject({
      fullName: 'Jean Mbarga',
      email: email('jean'),
      role: 'DRIVER',
      isActive: true,
    });
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
  });

  it('the new driver can log in with the initial password', async () => {
    await createDriver('can-login').expect(201);

    await tokenFor(email('can-login'));
  });

  it('POST /drivers → 409 EMAIL_ALREADY_USED on a duplicate e-mail', async () => {
    const res = await createDriver('existing-driver').expect(409);

    expect(res.body).toMatchObject({ message: 'EMAIL_ALREADY_USED' });
  });

  it('POST /drivers → 400 on an invalid body (short password, unknown field)', async () => {
    await http()
      .post(apiPath('drivers'))
      .set('Authorization', `Bearer ${dispatcherToken}`)
      .send({
        fullName: 'X',
        email: email('bad'),
        password: 'short',
        role: 'DISPATCHER',
      })
      .expect(400);
  });

  it('a DRIVER gets 403 on every /drivers route', async () => {
    const res = await http()
      .get(apiPath('drivers'))
      .set('Authorization', `Bearer ${driverToken}`)
      .expect(403);
    expect(res.body).toMatchObject({ message: 'INSUFFICIENT_ROLE' });

    await http()
      .post(apiPath('drivers'))
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ fullName: 'Hacker', email: email('hacker'), password: PASSWORD })
      .expect(403);
  });

  it('GET /drivers lists only drivers, filterable by isActive', async () => {
    const res = await http()
      .get(apiPath('drivers'))
      .query({ isActive: 'true' })
      .set('Authorization', `Bearer ${dispatcherToken}`)
      .expect(200);

    const drivers = res.body.data as { role: string; isActive: boolean }[];
    expect(drivers.length).toBeGreaterThan(0);
    expect(drivers.every((d) => d.role === 'DRIVER' && d.isActive)).toBe(true);
  });

  it('GET /drivers/:id → 404 for the dispatcher id (not a driver), 400 for a non-uuid', async () => {
    await http()
      .get(apiPath(`drivers/${dispatcherId}`))
      .set('Authorization', `Bearer ${dispatcherToken}`)
      .expect(404);
    await http()
      .get(apiPath('drivers/not-a-uuid'))
      .set('Authorization', `Bearer ${dispatcherToken}`)
      .expect(400);
  });

  it('PATCH /drivers/:id updates the name and the password', async () => {
    const created = await createDriver('to-update').expect(201);
    const id = created.body.data.id as string;

    const res = await http()
      .patch(apiPath(`drivers/${id}`))
      .set('Authorization', `Bearer ${dispatcherToken}`)
      .send({ fullName: 'Renamed Driver', password: 'NewPassword123!' })
      .expect(200);

    expect(res.body.data.fullName).toBe('Renamed Driver');
    await http()
      .post(apiPath('auth/login'))
      .send({ email: email('to-update'), password: 'NewPassword123!' })
      .expect(200);
  });

  it.each([['fullName'], ['email'], ['password']])(
    'PATCH /drivers/:id with %s: null → 400 (not a 500)',
    async (field) => {
      const created = await createDriver(`null-${field.toLowerCase()}`).expect(
        201,
      );
      const id = created.body.data.id as string;

      await http()
        .patch(apiPath(`drivers/${id}`))
        .set('Authorization', `Bearer ${dispatcherToken}`)
        .send({ [field]: null })
        .expect(400);
    },
  );

  it('POST /drivers → 400 when the password exceeds 72 BYTES (bcrypt limit), even under 72 characters', async () => {
    // 37 caractères mais 73 octets UTF-8 : bcrypt tronquerait silencieusement.
    await http()
      .post(apiPath('drivers'))
      .set('Authorization', `Bearer ${dispatcherToken}`)
      .send({
        fullName: 'Multibyte',
        email: email('multibyte'),
        password: `${'é'.repeat(36)}A`,
      })
      .expect(400);
  });

  it('PATCH /drivers/:id/status → 409 while the driver has an open mission, then disables and blocks login', async () => {
    const created = await createDriver('to-disable').expect(201);
    const id = created.body.data.id as string;
    const mission = await prisma.mission.create({
      data: {
        reference: `E2E-${suffix}-OPEN`,
        customerName: 'Client',
        pickupAddress: 'A',
        deliveryAddress: 'B',
        plannedDate: new Date(),
        driverId: id,
        createdById: dispatcherId,
      },
    });

    const refused = await http()
      .patch(apiPath(`drivers/${id}/status`))
      .set('Authorization', `Bearer ${dispatcherToken}`)
      .send({ isActive: false })
      .expect(409);
    expect(refused.body).toMatchObject({ message: 'DRIVER_HAS_OPEN_MISSIONS' });

    await prisma.mission.delete({ where: { id: mission.id } });
    await http()
      .patch(apiPath(`drivers/${id}/status`))
      .set('Authorization', `Bearer ${dispatcherToken}`)
      .send({ isActive: false })
      .expect(200);

    const login = await http()
      .post(apiPath('auth/login'))
      .send({ email: email('to-disable'), password: PASSWORD })
      .expect(403);
    expect(login.body).toMatchObject({ message: 'ACCOUNT_DISABLED' });
  });
});
