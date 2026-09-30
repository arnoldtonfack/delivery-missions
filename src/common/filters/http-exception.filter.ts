import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { Prisma } from '../../../generated/prisma/client';

/**
 * Filtre d'exceptions global.
 *
 * ÉTEND le filtre de base NestJS plutôt que de réécrire la réponse : le format
 * d'erreur reste le format normalisé `{ statusCode, message, error }` (celui que
 * documentent les helpers de `common/swagger`), et les erreurs inattendues restent
 * journalisées avec leur stack puis renvoyées en 500 générique — jamais de détail
 * interne exposé au client.
 *
 * Ajout : traduction des erreurs Prisma connues en erreurs HTTP. Sans cela, une
 * violation d'unicité ou un enregistrement introuvable sortait en 500.
 */
@Catch()
export class HttpExceptionFilter extends BaseExceptionFilter {
  /** @inheritdoc */
  catch(exception: unknown, host: ArgumentsHost): void {
    super.catch(toHttpException(exception), host);
  }
}

/**
 * Traduit une erreur Prisma connue en HttpException ; toute autre valeur est
 * renvoyée telle quelle.
 */
export const toHttpException = (exception: unknown): unknown => {
  if (!(exception instanceof Prisma.PrismaClientKnownRequestError)) {
    return exception;
  }
  switch (exception.code) {
    // Unique constraint failed
    case 'P2002':
      return new ConflictException('RESOURCE_ALREADY_EXISTS');
    // Foreign key constraint failed
    case 'P2003':
      return new BadRequestException('INVALID_RELATION');
    // Record to update/delete not found
    case 'P2025':
      return new NotFoundException('RESOURCE_NOT_FOUND');
    default:
      return exception;
  }
};
