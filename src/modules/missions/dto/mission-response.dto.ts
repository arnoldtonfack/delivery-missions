import { ApiProperty } from '@nestjs/swagger';
import { MissionStatus } from '../../../../generated/prisma/client';
import { UserSummaryDto } from '../../users/dto/user-summary.dto';

export class MissionResponseDto {
  @ApiProperty({ format: 'uuid' })
  readonly id: string;

  @ApiProperty({ example: 'CMD-2026-0001' })
  readonly reference: string;

  @ApiProperty({ example: 'Boulangerie du Centre' })
  readonly customerName: string;

  @ApiProperty({ example: 'Entrepôt Bonabéri, Douala' })
  readonly pickupAddress: string;

  @ApiProperty({ example: 'Rue Joss, Akwa, Douala' })
  readonly deliveryAddress: string;

  @ApiProperty({ example: '2026-10-01', format: 'date' })
  readonly plannedDate: string;

  @ApiProperty({ enum: MissionStatus, enumName: 'MissionStatus' })
  readonly status: MissionStatus;

  @ApiProperty({ type: String, nullable: true, description: 'Si FAILED' })
  readonly failureReason: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'Si DELIVERED' })
  readonly deliveryComment: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  readonly startedAt: Date | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'Date et heure de livraison ou d’échec (horloge serveur)',
  })
  readonly completedAt: Date | null;

  @ApiProperty({ type: UserSummaryDto })
  readonly driver: UserSummaryDto;

  @ApiProperty({ type: String, format: 'date-time' })
  readonly createdAt: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  readonly updatedAt: Date;
}
