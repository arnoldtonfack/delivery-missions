import type { Prisma } from '../../../generated/prisma/client';

export interface ILockedDriver {
  readonly id: string;
  readonly isActive: boolean;
}

/**
 * Verrouille la ligne d'un chauffeur (`SELECT … FOR UPDATE`) jusqu'à la fin de
 * la transaction `tx`. Pris par la désactivation ET par l'affectation d'une
 * mission : l'une attend l'autre, donc une mission ne peut jamais être affectée
 * à un chauffeur en train d'être désactivé (ni l'inverse).
 *
 * @returns le chauffeur verrouillé, ou `null` si l'id n'est pas un DRIVER.
 */
export const lockDriver = async (
  tx: Prisma.TransactionClient,
  driverId: string,
): Promise<ILockedDriver | null> => {
  const rows = await tx.$queryRaw<ILockedDriver[]>`
    SELECT "id", "isActive" FROM "User"
    WHERE "id" = ${driverId}::uuid AND "role" = 'DRIVER'
    FOR UPDATE`;
  return rows[0] ?? null;
};
