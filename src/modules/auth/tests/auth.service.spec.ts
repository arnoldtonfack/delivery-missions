import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { hashPassword } from '../../../common/crypto/password.util';
import { PrismaService } from '../../../database/prisma.service';
import { AuthService } from '../auth.service';

describe('AuthService', () => {
  const PASSWORD = 'Password123!';
  let service: AuthService;
  let prisma: { user: { findUnique: jest.Mock; findUniqueOrThrow: jest.Mock } };
  let jwtService: { signAsync: jest.Mock };
  let passwordHash: string;

  const dbUser = (
    overrides: Partial<Record<string, unknown>> = {},
  ): Record<string, unknown> => ({
    id: '6f1c2b1e-8a7d-4f55-9d0f-0c5b1f0a1e11',
    email: 'driver1@delivery.cm',
    fullName: 'Jean Mbarga',
    role: 'DRIVER',
    isActive: true,
    createdAt: new Date('2026-09-30T08:00:00Z'),
    passwordHash,
    ...overrides,
  });

  beforeAll(async () => {
    passwordHash = await hashPassword(PASSWORD);
  });

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn() },
    };
    jwtService = { signAsync: jest.fn().mockResolvedValue('signed.jwt.token') };

    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwtService },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('3600') },
        },
      ],
    }).compile();
    service = module.get(AuthService);
  });

  it('returns a token and the public user on valid credentials', async () => {
    prisma.user.findUnique.mockResolvedValue(dbUser());

    const result = await service.login({
      email: 'driver1@delivery.cm',
      password: PASSWORD,
    });

    expect(result).toMatchObject({
      accessToken: 'signed.jwt.token',
      tokenType: 'Bearer',
      expiresIn: 3600,
      user: { email: 'driver1@delivery.cm', role: 'DRIVER' },
    });
    expect(jwtService.signAsync).toHaveBeenCalledWith({
      sub: dbUser().id,
      role: 'DRIVER',
    });
  });

  it('never returns the password hash', async () => {
    prisma.user.findUnique.mockResolvedValue(dbUser());

    const result = await service.login({
      email: 'driver1@delivery.cm',
      password: PASSWORD,
    });

    expect(JSON.stringify(result)).not.toContain('passwordHash');
    expect(JSON.stringify(result)).not.toContain(passwordHash);
  });

  it('rejects a wrong password with INVALID_CREDENTIALS', async () => {
    prisma.user.findUnique.mockResolvedValue(dbUser());

    await expect(
      service.login({ email: 'driver1@delivery.cm', password: 'wrong' }),
    ).rejects.toThrow(new UnauthorizedException('INVALID_CREDENTIALS'));
    expect(jwtService.signAsync).not.toHaveBeenCalled();
  });

  it('rejects an unknown login with the SAME error (no account enumeration)', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(
      service.login({ email: 'ghost@delivery.cm', password: PASSWORD }),
    ).rejects.toThrow(new UnauthorizedException('INVALID_CREDENTIALS'));
  });

  it('rejects a disabled account with ACCOUNT_DISABLED', async () => {
    prisma.user.findUnique.mockResolvedValue(dbUser({ isActive: false }));

    await expect(
      service.login({ email: 'driver1@delivery.cm', password: PASSWORD }),
    ).rejects.toThrow(new ForbiddenException('ACCOUNT_DISABLED'));
    expect(jwtService.signAsync).not.toHaveBeenCalled();
  });

  it('does not reveal ACCOUNT_DISABLED without the right password', async () => {
    prisma.user.findUnique.mockResolvedValue(dbUser({ isActive: false }));

    await expect(
      service.login({ email: 'driver1@delivery.cm', password: 'wrong' }),
    ).rejects.toThrow(new UnauthorizedException('INVALID_CREDENTIALS'));
  });
});
