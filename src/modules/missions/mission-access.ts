import { type Prisma, Role } from '../../../generated/prisma/client';
import type { IAuthenticatedUser } from '../../common/guards/authenticated-request';

/** Ce dont le contrôle d'accès a besoin sur l'appelant. */
export type TMissionViewer = Pick<IAuthenticatedUser, 'id' | 'role'>;

/**
 * Missions visibles par l'appelant, à combiner dans chaque `where` : tout pour
 * le dispatcher, uniquement les siennes pour un chauffeur. Le filtre est dans la
 * REQUÊTE (pas un contrôle après lecture) : la mission d'un autre chauffeur est
 * introuvable, exactement comme une mission inexistante. Partagé par les
 * missions et le dashboard pour que la règle ne diverge jamais.
 */
export const visibleBy = (viewer: TMissionViewer): Prisma.MissionWhereInput =>
  viewer.role === Role.DRIVER ? { driverId: viewer.id } : {};
