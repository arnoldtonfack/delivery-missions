import type { ApiResponseOptions } from '@nestjs/swagger';

/**
 * Fabriques de réponses d'erreur Swagger, PARTAGÉES par tous les modules.
 *
 * Le corps `{ statusCode, message, error }` est le format normalisé de NestJS
 * (conservé par `HttpExceptionFilter`). Le centraliser évite qu'il diverge d'un
 * endpoint à l'autre. `message` porte un CODE MÉTIER, jamais un message interne.
 */

const errorExample = (
  statusCode: number,
  error: string,
  message: string | readonly string[],
): Record<string, unknown> => ({ statusCode, message, error });

/** 400 : validation du DTO ou code métier. */
export const badRequestResponse = (
  description: string,
  exampleMessage: string | readonly string[],
): ApiResponseOptions => ({
  description,
  example: errorExample(400, 'Bad Request', exampleMessage),
});

/** 401 : jeton absent/invalide/expiré, identifiants invalides, compte désactivé. */
export const unauthorizedResponse = (
  description = 'Jeton absent, invalide ou expiré',
  exampleCode = 'AUTH_TOKEN_INVALID',
): ApiResponseOptions => ({
  description,
  example: errorExample(401, 'Unauthorized', exampleCode),
});

/** 403 : authentifié mais rôle ou état du compte insuffisant. */
export const forbiddenResponse = (
  description = 'Rôle insuffisant pour cette action',
  exampleCode = 'INSUFFICIENT_ROLE',
): ApiResponseOptions => ({
  description,
  example: errorExample(403, 'Forbidden', exampleCode),
});

/** 404 : ressource introuvable. */
export const notFoundResponse = (
  description: string,
  exampleCode = 'RESOURCE_NOT_FOUND',
): ApiResponseOptions => ({
  description,
  example: errorExample(404, 'Not Found', exampleCode),
});

/** 409 : conflit (unicité, état incompatible). */
export const conflictResponse = (
  description: string,
  exampleCode = 'RESOURCE_ALREADY_EXISTS',
): ApiResponseOptions => ({
  description,
  example: errorExample(409, 'Conflict', exampleCode),
});
