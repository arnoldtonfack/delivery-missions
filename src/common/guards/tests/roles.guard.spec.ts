import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '../roles.guard';

const contextWithUser = (user: unknown): ExecutionContext => {
  // Contexte minimal : seules ces méthodes sont appelées par le guard.
  const context = {
    getHandler: (): unknown => undefined,
    getClass: (): unknown => undefined,
    switchToHttp: () => ({ getRequest: (): unknown => ({ user }) }),
  };
  return context as unknown as ExecutionContext;
};

const driver = {
  id: '6f1c2b1e-8a7d-4f55-9d0f-0c5b1f0a1e11',
  email: 'driver1@delivery.cm',
  fullName: 'Jean Mbarga',
  role: 'DRIVER',
};

describe('RolesGuard', () => {
  let reflector: { getAllAndOverride: jest.Mock };
  let guard: RolesGuard;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() };
    guard = new RolesGuard(reflector as unknown as Reflector);
  });

  it('allows any authenticated user when no @Roles() is set', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);

    expect(guard.canActivate(contextWithUser(driver))).toBe(true);
  });

  it('allows a user whose role is listed', () => {
    reflector.getAllAndOverride.mockReturnValue(['DRIVER']);

    expect(guard.canActivate(contextWithUser(driver))).toBe(true);
  });

  it('forbids a DRIVER on a DISPATCHER-only route', () => {
    reflector.getAllAndOverride.mockReturnValue(['DISPATCHER']);

    expect(() => guard.canActivate(contextWithUser(driver))).toThrow(
      new ForbiddenException('INSUFFICIENT_ROLE'),
    );
  });

  it('forbids when no authenticated user is on the request', () => {
    reflector.getAllAndOverride.mockReturnValue(['DISPATCHER']);

    expect(() => guard.canActivate(contextWithUser(undefined))).toThrow(
      ForbiddenException,
    );
  });
});
