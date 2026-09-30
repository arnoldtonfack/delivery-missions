import type { Request } from 'express';
import { Role } from '../../../generated/prisma/client';

/** Utilisateur authentifié, relu en base par `JwtAuthGuard` à chaque requête. */
export interface IAuthenticatedUser {
  readonly id: string;
  readonly email: string;
  readonly fullName: string;
  readonly role: Role;
}

/** Charge utile signée dans le jeton d'accès. */
export interface IAccessTokenPayload {
  readonly sub: string;
  readonly role: Role;
}

/** Clé portant l'utilisateur authentifié sur la requête. */
export const AUTHENTICATED_REQUEST_KEY = 'user';

export type TAuthenticatedRequest = Request & {
  [AUTHENTICATED_REQUEST_KEY]?: unknown;
};

const ROLES: readonly string[] = Object.values(Role);

/**
 * Garde de type — la valeur posée sur `request.user` est-elle un utilisateur
 * authentifié ? Partagée par `RolesGuard` et `@CurrentUser()` pour qu'ils ne
 * divergent jamais.
 */
export const isAuthenticatedUser = (
  value: unknown,
): value is IAuthenticatedUser => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate: Record<string, unknown> = { ...value };
  return (
    typeof candidate.id === 'string' &&
    candidate.id.length > 0 &&
    typeof candidate.email === 'string' &&
    typeof candidate.fullName === 'string' &&
    typeof candidate.role === 'string' &&
    ROLES.includes(candidate.role)
  );
};
