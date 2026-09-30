import type { Prisma } from '../../../generated/prisma/client';
import { dateToDateOnly } from '../../common/utils/business-date.util';
import type { MissionDetailResponseDto } from './dto/mission-detail-response.dto';
import type { MissionResponseDto } from './dto/mission-response.dto';

/** Colonnes à lire pour construire un `MissionResponseDto`. */
export const MISSION_RESPONSE_SELECT = {
  id: true,
  reference: true,
  customerName: true,
  pickupAddress: true,
  deliveryAddress: true,
  plannedDate: true,
  status: true,
  failureReason: true,
  deliveryComment: true,
  startedAt: true,
  completedAt: true,
  createdAt: true,
  updatedAt: true,
  driver: { select: { id: true, fullName: true } },
} as const satisfies Prisma.MissionSelect;

export type TMissionResponseRow = Prisma.MissionGetPayload<{
  select: typeof MISSION_RESPONSE_SELECT;
}>;

export const toMissionResponse = (
  mission: TMissionResponseRow,
): MissionResponseDto => ({
  id: mission.id,
  reference: mission.reference,
  customerName: mission.customerName,
  pickupAddress: mission.pickupAddress,
  deliveryAddress: mission.deliveryAddress,
  plannedDate: dateToDateOnly(mission.plannedDate),
  status: mission.status,
  failureReason: mission.failureReason,
  deliveryComment: mission.deliveryComment,
  startedAt: mission.startedAt,
  completedAt: mission.completedAt,
  driver: { id: mission.driver.id, fullName: mission.driver.fullName },
  createdAt: mission.createdAt,
  updatedAt: mission.updatedAt,
});

/** `MISSION_RESPONSE_SELECT` + l'historique des statuts, en une seule requête. */
export const MISSION_DETAIL_SELECT = {
  ...MISSION_RESPONSE_SELECT,
  statusHistory: {
    select: {
      id: true,
      fromStatus: true,
      toStatus: true,
      note: true,
      createdAt: true,
      actor: { select: { id: true, fullName: true } },
    },
    // Départage à horodatage égal : l'ordre de l'enum (PLANNED < STARTED <
    // DELIVERED | FAILED) est celui du workflow, et chaque statut n'est atteint
    // qu'une fois par mission.
    orderBy: [{ createdAt: 'asc' }, { toStatus: 'asc' }],
  },
} as const satisfies Prisma.MissionSelect;

export type TMissionDetailRow = Prisma.MissionGetPayload<{
  select: typeof MISSION_DETAIL_SELECT;
}>;

export const toMissionDetailResponse = (
  mission: TMissionDetailRow,
): MissionDetailResponseDto => ({
  ...toMissionResponse(mission),
  statusHistory: mission.statusHistory.map((entry) => ({
    id: entry.id,
    fromStatus: entry.fromStatus,
    toStatus: entry.toStatus,
    note: entry.note,
    actor: { id: entry.actor.id, fullName: entry.actor.fullName },
    createdAt: entry.createdAt,
  })),
});
