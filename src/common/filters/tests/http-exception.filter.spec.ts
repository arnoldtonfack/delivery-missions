import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client';
import { toHttpException } from '../http-exception.filter';

const prismaError = (code: string): Prisma.PrismaClientKnownRequestError =>
  new Prisma.PrismaClientKnownRequestError('prisma failure', {
    code,
    clientVersion: 'test',
  });

describe('toHttpException', () => {
  it('maps a unique constraint violation (P2002) to 409', () => {
    expect(toHttpException(prismaError('P2002'))).toBeInstanceOf(
      ConflictException,
    );
  });

  it('maps a foreign key violation (P2003) to 400', () => {
    expect(toHttpException(prismaError('P2003'))).toBeInstanceOf(
      BadRequestException,
    );
  });

  it('maps a missing record (P2025) to 404', () => {
    expect(toHttpException(prismaError('P2025'))).toBeInstanceOf(
      NotFoundException,
    );
  });

  it('leaves unknown Prisma codes untouched (→ 500 by the base filter)', () => {
    const error = prismaError('P2034');
    expect(toHttpException(error)).toBe(error);
  });

  it('leaves non-Prisma errors untouched', () => {
    const error = new Error('boom');
    expect(toHttpException(error)).toBe(error);
  });
});
