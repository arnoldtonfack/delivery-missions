import type { Prisma } from '../../../generated/prisma/client';
import type { UserResponseDto } from './dto/user-response.dto';

/** Colonnes à lire pour construire un `UserResponseDto` (jamais `passwordHash`). */
export const USER_RESPONSE_SELECT = {
  id: true,
  email: true,
  fullName: true,
  role: true,
  isActive: true,
  createdAt: true,
} as const satisfies Prisma.UserSelect;

export type TUserResponseRow = Prisma.UserGetPayload<{
  select: typeof USER_RESPONSE_SELECT;
}>;

export const toUserResponse = (user: TUserResponseRow): UserResponseDto => ({
  id: user.id,
  email: user.email,
  fullName: user.fullName,
  role: user.role,
  isActive: user.isActive,
  createdAt: user.createdAt,
});
