import { CustomDecorator, SetMetadata } from '@nestjs/common';
import type { Role } from '../../../generated/prisma/client';

export const ROLES_KEY = 'roles';

/**
 * Restreint une route (ou un contrôleur) aux rôles listés. Vérifié par
 * `RolesGuard`. Sans ce décorateur, tout utilisateur authentifié passe : le
 * contrôle de PROPRIÉTÉ (un chauffeur et ses missions) reste dans les services.
 */
export const Roles = (...roles: Role[]): CustomDecorator<typeof ROLES_KEY> =>
  SetMetadata(ROLES_KEY, roles);
