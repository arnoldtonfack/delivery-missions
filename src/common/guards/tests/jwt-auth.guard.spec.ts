import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../../database/prisma.service';
import { JwtAuthGuard } from '../jwt-auth.guard';

const USER_ID = '6f1c2b1e-8a7d-4f55-9d0f-0c5b1f0a1e11';

const httpContext = (request: Record<string, unknown>): ExecutionContext => {
  // Contexte minimal : seules ces méthodes sont appelées par le guard.
  const context = {
    getHandler: (): unknown => undefined,
    getClass: (): unknown => undefined,
    switchToHttp: () => ({ getRequest: (): unknown => request }),
  };
  return context as unknown as ExecutionContext;
};

describe('JwtAuthGuard', () => {
  let reflector: { getAllAndOverride: jest.Mock };
  let jwtService: { verifyAsync: jest.Mock };
  let prisma: { user: { findUnique: jest.Mock } };
  let guard: JwtAuthGuard;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn().mockReturnValue(false) };
    jwtService = {
      verifyAsync: jest
        .fn()
        .mockResolvedValue({ sub: USER_ID, role: 'DRIVER' }),
    };
    prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: USER_ID,
          email: 'driver1@delivery.cm',
          fullName: 'Jean Mbarga',
          role: 'DRIVER',
          isActive: true,
        }),
      },
    };
    guard = new JwtAuthGuard(
      reflector as unknown as Reflector,
      jwtService as unknown as JwtService,
      prisma as unknown as PrismaService,
    );
  });

  it('lets @Public() routes through without a token', async () => {
    reflector.getAllAndOverride.mockReturnValue(true);

    await expect(guard.canActivate(httpContext({ headers: {} }))).resolves.toBe(
      true,
    );
    expect(jwtService.verifyAsync).not.toHaveBeenCalled();
  });

  it('rejects a request without a Bearer token', async () => {
    await expect(
      guard.canActivate(httpContext({ headers: {} })),
    ).rejects.toThrow(new UnauthorizedException('AUTH_TOKEN_MISSING'));
  });

  it('rejects an invalid or expired token', async () => {
    jwtService.verifyAsync.mockRejectedValue(new Error('jwt expired'));

    await expect(
      guard.canActivate(
        httpContext({ headers: { authorization: 'Bearer bad.token' } }),
      ),
    ).rejects.toThrow(new UnauthorizedException('AUTH_TOKEN_INVALID'));
  });

  it('rejects a valid token whose user has been disabled since', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: USER_ID,
      email: 'driver1@delivery.cm',
      fullName: 'Jean Mbarga',
      role: 'DRIVER',
      isActive: false,
    });

    await expect(
      guard.canActivate(
        httpContext({ headers: { authorization: 'Bearer good.token' } }),
      ),
    ).rejects.toThrow(new UnauthorizedException('ACCOUNT_DISABLED'));
  });

  it('attaches the user read from the database (not the token) to the request', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      sub: USER_ID,
      role: 'DISPATCHER',
    });
    const request: Record<string, unknown> = {
      headers: { authorization: 'Bearer good.token' },
    };

    await expect(guard.canActivate(httpContext(request))).resolves.toBe(true);
    expect(request.user).toEqual({
      id: USER_ID,
      email: 'driver1@delivery.cm',
      fullName: 'Jean Mbarga',
      role: 'DRIVER',
    });
  });
});
