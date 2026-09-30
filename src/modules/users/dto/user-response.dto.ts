import { ApiProperty } from '@nestjs/swagger';
import { Role } from '../../../../generated/prisma/client';

/** Utilisateur exposé par l'API — jamais le hash du mot de passe. */
export class UserResponseDto {
  @ApiProperty({ format: 'uuid' })
  readonly id: string;

  @ApiProperty({ example: 'driver1@delivery.cm' })
  readonly email: string;

  @ApiProperty({ example: 'Jean Mbarga' })
  readonly fullName: string;

  @ApiProperty({ enum: Role, enumName: 'Role' })
  readonly role: Role;

  @ApiProperty()
  readonly isActive: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  readonly createdAt: Date;
}
