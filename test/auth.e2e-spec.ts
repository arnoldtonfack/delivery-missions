import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { hashPassword } from 'src/common/crypto/password.util';
import { PrismaService } from 'src/database/prisma.service';
import { apiPath, createE2eApp } from './utils/create-e2e-app';

/**
 * Authentification de bout en bout contre la vraie base (`make infra`).
 * Comptes créés avec un suffixe unique puis supprimés : n'altère pas le seed.
 */
describe('Auth (e2e)', () => {
  const PASSWORD = 'Password123!';
  const suffix = Date.now().toString(36);
  const emails = {
    dispatcher: `e2e-dispatcher-${suffix}@test.local`,
    driver: `e2e-driver-${suffix}@test.local`,
    disabled: `e2e-disabled-${suffix}@test.local`,
  };

  let app: INestApplication<App>;
  let prisma: PrismaService;

  const login = (email: string, password = PASSWORD): request.Test =>
    request(app.getHttpServer())
      .post(apiPath('auth/login'))
      .send({ email, password });

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
    const passwordHash = await hashPassword(PASSWORD);
    await prisma.user.createMany({
      data: [
        {
          email: emails.dispatcher,
          fullName: 'E2E Dispatcher',
          role: 'DISPATCHER',
          passwordHash,
        },
        {
          email: emails.driver,
          fullName: 'E2E Driver',
          role: 'DRIVER',
          passwordHash,
        },
        {
          email: emails.disabled,
          fullName: 'E2E Disabled',
          role: 'DRIVER',
          passwordHash,
          isActive: false,
        },
      ],
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { in: Object.values(emails) } },
    });
    await app.close();
  });

  it('POST /auth/login → 200 with a token and no password hash', async () => {
    const res = await login(emails.driver).expect(200);

    expect(res.body).toMatchObject({
      success: true,
      data: {
        tokenType: 'Bearer',
        user: { email: emails.driver, role: 'DRIVER', isActive: true },
      },
    });
    expect(typeof res.body.data.accessToken).toBe('string');
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
  });

  it('email is case/whitespace-insensitive', async () => {
    await login(`  ${emails.driver.toUpperCase()} `).expect(200);
  });

  it('wrong password and unknown email → same 401 INVALID_CREDENTIALS', async () => {
    const wrong = await login(emails.driver, 'wrong-password').expect(401);
    const unknown = await login(`nobody-${suffix}@test.local`).expect(401);

    expect(wrong.body).toMatchObject({ message: 'INVALID_CREDENTIALS' });
    expect(unknown.body).toMatchObject({ message: 'INVALID_CREDENTIALS' });
  });

  it('disabled account → 403 ACCOUNT_DISABLED', async () => {
    const res = await login(emails.disabled).expect(403);

    expect(res.body).toMatchObject({ message: 'ACCOUNT_DISABLED' });
  });

  it('invalid body → 400 (validation)', async () => {
    await request(app.getHttpServer())
      .post(apiPath('auth/login'))
      .send({ email: 'not-an-email', password: PASSWORD, role: 'DISPATCHER' })
      .expect(400);
  });

  it('GET /auth/me → 401 without token, 401 with a forged token', async () => {
    const missing = await request(app.getHttpServer())
      .get(apiPath('auth/me'))
      .expect(401);
    const forged = await request(app.getHttpServer())
      .get(apiPath('auth/me'))
      .set('Authorization', 'Bearer not.a.real.token')
      .expect(401);

    expect(missing.body).toMatchObject({ message: 'AUTH_TOKEN_MISSING' });
    expect(forged.body).toMatchObject({ message: 'AUTH_TOKEN_INVALID' });
  });

  it('GET /auth/me → 200 with the connected profile', async () => {
    const token = (await login(emails.dispatcher).expect(200)).body.data
      .accessToken as string;

    const res = await request(app.getHttpServer())
      .get(apiPath('auth/me'))
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data).toMatchObject({
      email: emails.dispatcher,
      role: 'DISPATCHER',
    });
  });

  it('a token stops working as soon as the account is disabled', async () => {
    const token = (await login(emails.driver).expect(200)).body.data
      .accessToken as string;
    await prisma.user.update({
      where: { email: emails.driver },
      data: { isActive: false },
    });

    const res = await request(app.getHttpServer())
      .get(apiPath('auth/me'))
      .set('Authorization', `Bearer ${token}`)
      .expect(401);

    expect(res.body).toMatchObject({ message: 'ACCOUNT_DISABLED' });
  });
});
