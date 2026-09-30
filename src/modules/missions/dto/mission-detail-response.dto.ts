import { ApiProperty } from '@nestjs/swagger';
import { MissionStatus } from '../../../../generated/prisma/client';
import { UserSummaryDto } from '../../users/dto/user-summary.dto';
import { MissionResponseDto } from './mission-response.dto';

/** Un changement de statut : de → vers, qui, quand. */
export class MissionStatusHistoryEntryDto {
  @ApiProperty({ format: 'uuid' })
  readonly id: string;

  @ApiProperty({
    enum: MissionStatus,
    enumName: 'MissionStatus',
    nullable: true,
    description: 'null pour l’entrée de création',
  })
  readonly fromStatus: MissionStatus | null;

  @ApiProperty({ enum: MissionStatus, enumName: 'MissionStatus' })
  readonly toStatus: MissionStatus;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Raison d’échec ou commentaire de livraison',
  })
  readonly note: string | null;

  @ApiProperty({ type: UserSummaryDto, description: 'Auteur du changement' })
  readonly actor: UserSummaryDto;

  @ApiProperty({ type: String, format: 'date-time' })
  readonly createdAt: Date;
}

export class MissionDetailResponseDto extends MissionResponseDto {
  @ApiProperty({
    type: MissionStatusHistoryEntryDto,
    isArray: true,
    description: 'Du plus ancien au plus récent',
  })
  readonly statusHistory: MissionStatusHistoryEntryDto[];
}
