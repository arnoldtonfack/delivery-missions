import { MissionStatus } from '../../../generated/prisma/client';

/**
 * Machine à états d'une mission, SEULE source des transitions autorisées :
 *
 *   PLANNED → STARTED → DELIVERED
 *                     ↘ FAILED
 *
 * DELIVERED et FAILED sont terminaux : une nouvelle tentative est une nouvelle
 * mission. Toute transition absente de ce tableau est refusée par l'API.
 */
const ALLOWED_TRANSITIONS: Readonly<
  Record<MissionStatus, readonly MissionStatus[]>
> = {
  [MissionStatus.PLANNED]: [MissionStatus.STARTED],
  [MissionStatus.STARTED]: [MissionStatus.DELIVERED, MissionStatus.FAILED],
  [MissionStatus.DELIVERED]: [],
  [MissionStatus.FAILED]: [],
};

export const canTransition = (
  from: MissionStatus,
  to: MissionStatus,
): boolean => ALLOWED_TRANSITIONS[from].includes(to);
