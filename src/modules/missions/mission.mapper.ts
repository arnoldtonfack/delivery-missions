import type { Prisma } from '../../../generated/prisma/client';
import { dateToDateOnly } from '../../common/utils/business-date.util';
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
